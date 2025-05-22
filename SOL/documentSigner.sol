// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DocumentSigner is Ownable, EIP712("DocumentSigner", "1.0.0") {
    struct SignatureInfo {
        address signer;
        uint256 timestamp;
        bytes signature;
        uint32 nonce;
        address sender;
    }
    struct SignerInfo {
        address signer;
        uint256 timestamp;
        address sender;
    }
    mapping(bytes32 => mapping(address => SignatureInfo)) public documentSignatures;
    mapping(bytes32 => SignerInfo[]) public signersForDocument;
    mapping(address => uint32) public nonce;

    event DocumentSigned(bytes32 documentHash, address signer, uint256 timestamp, bytes signature);

    constructor() Ownable(msg.sender) {}

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

        // Add signer to the list if not already present
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

    function isSignedBy(bytes32 documentHash, address signer) external view returns (bool) {
        return documentSignatures[documentHash][signer].signer == signer;
    }

    function getSigners(bytes32 documentHash) external view returns (SignerInfo[] memory) {
        return signersForDocument[documentHash];
    }

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
        // Eliminem al signatari de la llista
        for (uint256 i = 0; i < signersForDocument[documentHash].length; i++) {
            if (signersForDocument[documentHash][i].signer == signer) {
                // Moguem a la llista per evitar el forat de l'eliminat
                for (uint256 j = i; j < signersForDocument[documentHash].length - 1; j++) {
                    signersForDocument[documentHash][j] = signersForDocument[documentHash][j + 1];
                }
                signersForDocument[documentHash].pop();
                break;
            }
        }
    }

    function invalidateAllSignatures(bytes32 documentHash) external onlyOwner {
        address[] memory signers = new address[](signersForDocument[documentHash].length);
        for (uint256 i = 0; i < signersForDocument[documentHash].length; i++) {
            signers[i] = signersForDocument[documentHash][i].signer; // Asumo que SignerInfo.signer es la dirección relevante
        }

        for (uint256 i = 0; i < signers.length; i++) {
            address currentSigner = signers[i];
            delete documentSignatures[documentHash][currentSigner];
        }
        delete signersForDocument[documentHash];
    }
}
