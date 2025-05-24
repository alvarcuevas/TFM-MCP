// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract AccreditationRegistry is Ownable {
    struct Accreditation {
        string name;
        uint256 validFrom; //timestamp
        uint256 validUntil; //timestamp
    }

    struct Signer {
        string name; // Nom de la persona
        uint256 timestamp;
        address signerAddress;
        bool isVerified; // Si un auditor ha verificat a la persona.
    }

    struct Laboratory {
        string name;
        bool isVerified;
        // Mapping per accedir a les acreditacions per nom (hash).
        mapping(bytes32 => Accreditation) accreditationsByHash;
        // Llista de les acreditacions completes.
        Accreditation[] accreditationList;
        // Mapping per saber si un hash està ja en accreditationList
        mapping(bytes32 => bool) accreditationExistsInList;
    }

    // Laboratoris
    mapping(address => Laboratory) public laboratories;

    // Signers
    mapping(address => Signer) public signers;

    // Auditors
    mapping(address => bool) public isAuditor;

    // Events per cada acció
    event LaboratoryAdded(address indexed laboratoryAddress, string name);
    event LaboratoryVerified(address indexed laboratoryAddress, bool isVerified);
    event AuditorAdded(address indexed auditorAddress);
    event AuditorRemoved(address indexed auditorAddress);
    event SignerAddMod(address indexed signerAddress, string name);
    event SignerVerified(address indexed SignerAddress, bool status);
    event AccreditationAdded(address indexed laboratoryAddress, bytes32 indexed accreditationHash, string accreditationName);
    event AccreditationUpdated(address indexed laboratoryAddress, bytes32 indexed accreditationHash, string accreditationName);
    event AccreditationRevoked(address indexed laboratoryAddress, bytes32 indexed accreditationHash);

    // Constructor que hereta de ownable
    constructor() Ownable(msg.sender) {}

    // Modificador per a que només els auditors poguen fer ús d'algunes accions.
    modifier onlyAuditor() {
        require(isAuditor[msg.sender], "Only auditor accounts can use this function");
        _;
    }

    /**
    * @dev Afegir una adreça com auditor. Només owner pot afegir auditors.
    * @param auditorAddress Adreça a afegir com auditor.
    */
    function addAuditor(address auditorAddress) external onlyOwner {
        require(auditorAddress != address(0), "Invalid address");
        require(!isAuditor[auditorAddress], "This address is already a auditor");
        isAuditor[auditorAddress] = true;
        emit AuditorAdded(auditorAddress);
    }

    /**
    * @dev Elimina un auditor. Només owner pot eliminar auditors.
    * @param auditorAddress Adreça a eliminar
    */
    function removeAuditor(address auditorAddress) external onlyOwner {
        require(auditorAddress != address(0), "Invalid address");
        require(isAuditor[auditorAddress], "This address is not a valid auditor");
        isAuditor[auditorAddress] = false;
        emit AuditorRemoved(auditorAddress);
    }

    /**
    * @dev Afegir un nou laboratori. Qualsevol pot afegir laboratoris.
    * @param laboratoryAddress La adreça del laboratori.
    * @param name El nom del laboratori.
    */
    function addLaboratory(address laboratoryAddress, string memory name) external {
        require(laboratoryAddress != address(0), "Invalid address");
        require(bytes(laboratories[laboratoryAddress].name).length == 0, "This address is already registered");
        
        laboratories[laboratoryAddress].name = name;
        laboratories[laboratoryAddress].isVerified = false; // No verificat d'inici.
        
        emit LaboratoryAdded(laboratoryAddress, name);
    }

    /**
    * @dev Permet verificar o desverificar un laboratori.
    * @param laboratoryAddress L'adreça del laboratori.
    * @param status L'estat de la verificació: true per verificat, false per no verificat.
    */
    function setLaboratoryVerificationStatus(address laboratoryAddress, bool status) external onlyAuditor {
        require(bytes(laboratories[laboratoryAddress].name).length > 0, "This address is not a valid laboratory");
        laboratories[laboratoryAddress].isVerified = status;
        emit LaboratoryVerified(laboratoryAddress, status);
    }

    /**
    * @dev Consulta la informació d'un laboratori
    * @param laboratoryAddress Adreça del laboratori
    * @return name Nom del laboratori
    * @return isVerified Estat de la verificació del laboratori
    * @return exists Indica si el laboratori s'ha registrat
    */
    function getLaboratoryInfo(address laboratoryAddress) external view returns (string memory name, bool isVerified, bool exists) {
        exists = (bytes(laboratories[laboratoryAddress].name).length > 0);
        if (exists) {
            name = laboratories[laboratoryAddress].name;
            isVerified = laboratories[laboratoryAddress].isVerified;
        }
        return (name, isVerified, exists);
    }

    /**
    * @dev Afegir una nova persona que signa. Qualsevol pot afegir el seu nom. Si ja existeix, es modifica.
    * @param name El nom de la persona.
    */
    function addModSigner(string memory name) external {        
        signers[msg.sender].name = name;
        signers[msg.sender].timestamp = block.timestamp;
        signers[msg.sender].isVerified = false; // No verificat d'inici.
        signers[msg.sender].signerAddress = msg.sender;
        emit SignerAddMod(msg.sender, name);
    }

    /**
    * @dev Permet verificar o desverificar un signatari.
    * @param SignerAddress L'adreça del signatari.
    * @param status L'estat de la verificació: true per verificat, false per no verificat.
    */
    function setSignerVerificationStatus(address SignerAddress, bool status) external onlyAuditor {
        require(bytes(signers[SignerAddress].name).length > 0, "This address is not registered");
        laboratories[SignerAddress].isVerified = status;
        emit SignerVerified(SignerAddress, status);
    }

    
    /**
    * @dev Afegeix o actualitza una acreditació a un laboratori específic. Només els auditors poden gastar aquesta funció. També actualitza acreditacions.
    * @param laboratoryAddress Adreça del laboratori
    * @param accreditationName Nom de la acreditació
    * @param validFrom Timestamp de l'inici de validesa de l'acreditació
    * @param validUntil Timestamp de final de validasa de l'acreditació
    */
    function addModAccreditation(address laboratoryAddress, string memory accreditationName, uint256 validFrom, uint256 validUntil) external onlyAuditor {
        require(bytes(laboratories[laboratoryAddress].name).length > 0, "This address is not a valid laboratory");
        require(validFrom < validUntil, "validFrom must be lower than validUntil");
        
        bytes32 accreditationHash = keccak256(abi.encode(accreditationName));
        Laboratory storage lab = laboratories[laboratoryAddress];

        bool exists = lab.accreditationsByHash[accreditationHash].validFrom != 0;

        // Actualitza el mapping per accedir ràpidament
        lab.accreditationsByHash[accreditationHash] = Accreditation(accreditationName, validFrom, validUntil);

        if (!exists) {
            // Acreditació nova
            lab.accreditationList.push(Accreditation(accreditationName, validFrom, validUntil));
            lab.accreditationExistsInList[accreditationHash] = true;
            emit AccreditationAdded(laboratoryAddress, accreditationHash, accreditationName);
        } else {
            // Actualització d'acreditació
            for (uint i = 0; i < lab.accreditationList.length; i++) {
                if (keccak256(abi.encode(lab.accreditationList[i].name)) == accreditationHash) {
                    lab.accreditationList[i].validFrom = validFrom;
                    lab.accreditationList[i].validUntil = validUntil;
                    emit AccreditationUpdated(laboratoryAddress, accreditationHash, accreditationName);
                    return; // No cal continuar buscant
                }
            }
        }
    }

    /**
    * @dev Revoca una acreditació d'un laboratori. Només auditors.
    * @param laboratoryAddress L'adreça del laboratori
    * @param accreditationName Nom de l'acreditació a revocar
    */
    function revokeAccreditation(address laboratoryAddress, string memory accreditationName) external onlyAuditor {
        require(bytes(laboratories[laboratoryAddress].name).length > 0, "This address is not a valid laboratory");

        bytes32 accreditationHash = keccak256(abi.encode(accreditationName));
        Laboratory storage lab = laboratories[laboratoryAddress];

        require(lab.accreditationsByHash[accreditationHash].validFrom != 0, "This accreditation is not in the selected laboratory");

        // Esborrem del mapping d'accés ràpid
        delete lab.accreditationsByHash[accreditationHash];
        lab.accreditationExistsInList[accreditationHash] = false; 

        // Eliminem de la llista
        for (uint i = 0; i < lab.accreditationList.length; i++) {
            if (keccak256(abi.encode(lab.accreditationList[i].name)) == accreditationHash) {
                lab.accreditationList[i] = lab.accreditationList[lab.accreditationList.length - 1];
                lab.accreditationList.pop();
                break;
            }
        }
        emit AccreditationRevoked(laboratoryAddress, accreditationHash);
    }

    /**
    * @dev Comprova si un laboratori concret té una acreditació indicada
    * @param laboratoryAddress Adreça del laboratori
    * @param accreditationName Nom de l'acreditació
    * @return bool True si existeix eixa acreditació per eixe laboratori
    */
    function hasValidAccreditation(address laboratoryAddress, string memory accreditationName) external view returns (bool) {
        bytes32 accreditationHash = keccak256(abi.encode(accreditationName));
        Accreditation storage acc = laboratories[laboratoryAddress].accreditationsByHash[accreditationHash];
        return (acc.validFrom != 0 && acc.validFrom <= block.timestamp && acc.validUntil >= block.timestamp);
    }

    /**
    * @dev Recuperar els detalls d'una acreditació concreta d'un laboratori
    * @param laboratoryAddress Adreça del laboratori
    * @param accreditationName Nom de l'acreditació
    * @return name Nom de l'acreditació
    * @return validFrom Timestamp d'inici de validesa
    * @return validUntil Timestamp de fi de validesa
    * @return exists True si existeix eixa acreditació per eixe laboratori
    */
    function getAccreditationDetails(address laboratoryAddress, string memory accreditationName) external view returns (string memory name, uint256 validFrom, uint256 validUntil, bool exists) {
        bytes32 accreditationHash = keccak256(abi.encode(accreditationName));
        Accreditation storage acc = laboratories[laboratoryAddress].accreditationsByHash[accreditationHash];

        // Una acreditación existeis només si 'validFrom' no és zero
        exists = (acc.validFrom != 0);
        if (exists) {
            name = acc.name;
            validFrom = acc.validFrom;
            validUntil = acc.validUntil;
        }
        return (name, validFrom, validUntil, exists);
    }

    /**
    * @dev Retorna tota la informació de totes les acreditacions d'un laboratori concret
    * @param laboratoryAddress Adreça del laboratori
    * @return Array de structs Accreditation amb tots els detalls
    */
    function getAllAccreditationsForLaboratory(address laboratoryAddress) external view returns (Accreditation[] memory) {
        return laboratories[laboratoryAddress].accreditationList;
    }
}