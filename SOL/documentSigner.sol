// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DocumentSigner is Ownable, EIP712("DocumentSigner", "1.0.0") {

    // Estructura per a la informació detallada de cada signatura
    struct SignatureInfo {
        address signer; // Qui signa (signatari)
        uint256 timestamp; // Quan es signa 
        bytes signature; // Signatura guardada
        uint32 nonce; // Quin nonce s'ha utilitzat per eixa signatura
        address sender; // Qui ha fet la transacció (laboratori)
    }

    //Estructrua per a tindre una llista ràpida de signants per document
    struct SignerInfo {
        address signer; // Qui signa (signatari)
        uint256 timestamp; // Quan es signa
        address sender; // Qui ha fet la transacció (laboratori)
    }

    // Mapping per a cada document i hash
    mapping(bytes32 => mapping(address => SignatureInfo)) public documentSignatures;
    // Mapping amb llista de signataris per a cada document
    mapping(bytes32 => SignerInfo[]) public signersForDocument;
    // Mapping amb els nonces següents de cada signatari.
    mapping(address => uint32) public nonce;

    event DocumentSigned(bytes32 documentHash, address signer, uint256 timestamp, bytes signature);

    // El contracte hereta de Ownable i també de EIP712
    constructor() Ownable(msg.sender) {}

    /**
    * @dev Funció per a signar un document per un signatari concret.
    * @param documentHash El hash del document, en keccak256.
    * @param signer Adreça del signatari. No té perquè ser la de qui fa la transacció.
    * @param signature La signatura, en format ECDSA.
    */
    function signDocument(
        bytes32 documentHash,
        address signer,
        bytes memory signature
    ) external {
        require(documentSignatures[documentHash][signer].signer == address(0), "Document already signed by this address.");
        uint32 currentNonce = nonce[signer];
        bytes32 structHash = _hashTypedDataV4(keccak256(
            abi.encode(
                keccak256("Document(bytes32 contentHash,uint32 nonce)"),
                documentHash,
                currentNonce
            )
        ));
        address signerSign = ECDSA.recover(structHash, signature);
        require(signer == signerSign, "Signature error.");
        nonce[signer]++;
        documentSignatures[documentHash][signer] = SignatureInfo(signer, block.timestamp, signature, currentNonce, msg.sender);

        // Afegir signatari a la llista si no està ja
        bool alreadySigned = false;
        for (uint256 i = 0; i < signersForDocument[documentHash].length; i++) {
            if (signersForDocument[documentHash][i].signer == signer) {
                alreadySigned = true;
                break;
            }
        }
        if (!alreadySigned) {
            signersForDocument[documentHash].push(SignerInfo(signer, block.timestamp, msg.sender));
        }

        emit DocumentSigned(documentHash, signer, block.timestamp, signature);
    }

    /**
    * @dev Funció per a verificar una signatura, enviant altra vegada la signatura.
    * @param documentHash El hash del document, en keccak256.
    * @param expectedSigner Adreça del signatari a verificar (i que ja es signa).
    * @param signature La signatura, en format ECDSA.
    * @return True si la signatura és correcta, i false altrament.
    */
    function verifySignature(
        bytes32 documentHash,
        address expectedSigner,
        bytes memory signature
    ) external view returns (bool) {
        require(documentSignatures[documentHash][expectedSigner].signer != address(0), "Signature not exists.");
        require(keccak256(signature) == keccak256(documentSignatures[documentHash][expectedSigner].signature), "Signature mismatch.");
        bytes32 structHash = _hashTypedDataV4(keccak256(
            abi.encode(
                keccak256("Document(bytes32 contentHash,uint32 nonce)"),
                documentHash,
                documentSignatures[documentHash][expectedSigner].nonce
            )
        ));
        address recoveredSigner = ECDSA.recover(structHash, signature);
        return recoveredSigner == expectedSigner;
    }

    /**
    * @dev Funció per a verificar una signatura, gastant l'emmagatzemada.
    * @param documentHash El hash del document, en keccak256.
    * @param expectedSigner Adreça del signatari a verificar.
    * @return True si la signatura és correcta, i false altrament.
    */
    function verifyStoredSignature(
        bytes32 documentHash,
        address expectedSigner
    ) external view returns (bool) {
        require(documentSignatures[documentHash][expectedSigner].signer != address(0), "Signature not exists.");
        bytes memory signature = documentSignatures[documentHash][expectedSigner].signature;
        bytes32 structHash = _hashTypedDataV4(keccak256(
            abi.encode(
                keccak256("Document(bytes32 contentHash,uint32 nonce)"),
                documentHash,
                documentSignatures[documentHash][expectedSigner].nonce
            )
        ));
        address recoveredSigner = ECDSA.recover(structHash, signature);
        return recoveredSigner == expectedSigner;
    }

    /**
    * @dev Funció per a verificar si existeix una signatura.
    * @param documentHash El hash del document, en keccak256.
    * @param signer Adreça del signatari.
    * @return True si existeix la signatura, false altrament.
    */
    function isSignedBy(bytes32 documentHash, address signer) external view returns (bool) {
        return documentSignatures[documentHash][signer].signer == signer;
    }

    /**
    * @dev Funció per a obtindre la signatura d'un document emesa per qui fa la petició.
    * @param documentHash El hash del document, en keccak256.
    * @return La signatura guardada.
    */
    function getSignature(bytes32 documentHash) external view returns (SignatureInfo memory) {
        return documentSignatures[documentHash][msg.sender];
    }

    /**
    * @dev Funció per a obtindre totes les signatures d'un document.
    * @param documentHash El hash del document, en keccak256.
    * @return La llista de signatures del document.
    */
    function getSigners(bytes32 documentHash) external view returns (SignerInfo[] memory) {
        return signersForDocument[documentHash];
    }

    /**
    * @dev Funció per a eliminar una signatura d'un document.
    * @param documentHash El hash del document, en keccak256.
    * @param signer Adreça del signatari a eliminar.
    * @param signature La signatura del procés d'eliminació, en format ECDSA.
    */
    function invalidateSignature(bytes32 documentHash, address signer, bytes memory signature) external {
        require(documentSignatures[documentHash][signer].signer != address(0), "Signature not exists.");
        uint32 currentNonce = nonce[signer];
        bytes32 structHash = _hashTypedDataV4(keccak256(
            abi.encode(
                keccak256("Document(bytes32 contentHash,uint32 nonce)"),
                documentHash,
                currentNonce
            )
        ));
        address recoveredSigner = ECDSA.recover(structHash, signature);
        require(signer == recoveredSigner, "Signature error.");
        nonce[signer]++;
        delete documentSignatures[documentHash][signer];
        // Eliminar signatari de la llista
        for (uint256 i = 0; i < signersForDocument[documentHash].length; i++) {
            if (signersForDocument[documentHash][i].signer == signer) {
                // Moure elements per a que no quede el forat a la llista
                for (uint256 j = i; j < signersForDocument[documentHash].length - 1; j++) {
                    signersForDocument[documentHash][j] = signersForDocument[documentHash][j + 1];
                }
                signersForDocument[documentHash].pop();
                break;
            }
        }
    }

    /**
    * @dev Funció per a eliminar totes les signatures d'un document. Només l'owner.
    * @param documentHash El hash del document, en keccak256.
    */
    function invalidateAllSignatures(bytes32 documentHash) external onlyOwner {
        address[] memory signers = new address[](signersForDocument[documentHash].length);
        for (uint256 i = 0; i < signersForDocument[documentHash].length; i++) {
            signers[i] = signersForDocument[documentHash][i].signer;
        }

        for (uint256 i = 0; i < signers.length; i++) {
            address currentSigner = signers[i];
            delete documentSignatures[documentHash][currentSigner];
        }
        delete signersForDocument[documentHash];
    }
}