// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract AccreditationRegistry is Ownable {
    struct Accreditation {
        string name;
        uint256 validFrom; //timestamp
        uint256 validUntil; //timestamp
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

    // Auditors
    mapping(address => bool) public isAuditor;

    // Events per cada acció
    event LaboratoryAdded(address indexed laboratoryAddress, string name);
    event LaboratoryVerified(address indexed laboratoryAddress, bool isVerified);
    event AuditorAdded(address indexed auditorAddress);
    event AuditorRemoved(address indexed auditorAddress);
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
    * @param _auditorAddress Adreça a afegir com auditor.
    */
    function addAuditor(address _auditorAddress) external onlyOwner {
        require(_auditorAddress != address(0), "Invalid address");
        require(!isAuditor[_auditorAddress], "This address is already a auditor");
        isAuditor[_auditorAddress] = true;
        emit AuditorAdded(_auditorAddress);
    }

    /**
    * @dev Elimina un auditor. Només owner pot eliminar auditors.
    * @param _auditorAddress Adreça a eliminar
    */
    function removeAuditor(address _auditorAddress) external onlyOwner {
        require(_auditorAddress != address(0), "Invalid address");
        require(isAuditor[_auditorAddress], "This address is not a valid auditor");
        isAuditor[_auditorAddress] = false;
        emit AuditorRemoved(_auditorAddress);
    }

    /**
    * @dev Afegir un nou laboratori. Qualsevol pot afegir laboratoris.
    * @param _laboratoryAddress La adreça del laboratori.
    * @param _name El nom del laboratori.
    */
    function addLaboratory(address _laboratoryAddress, string memory _name) external {
        require(_laboratoryAddress != address(0), "Invalid address");
        require(bytes(laboratories[_laboratoryAddress].name).length == 0, "This address is already registered");
        
        laboratories[_laboratoryAddress].name = _name;
        laboratories[_laboratoryAddress].isVerified = false; // No verificat d'inici.
        
        emit LaboratoryAdded(_laboratoryAddress, _name);
    }

    /**
    * @dev Permet verificar o desverificar un laboratori.
    * @param _laboratoryAddress L'adreça del laboratori.
    * @param _status L'estat de la verificació: true per verificat, false per no verificat.
    */
    function setLaboratoryVerificationStatus(address _laboratoryAddress, bool _status) external onlyAuditor {
        require(bytes(laboratories[_laboratoryAddress].name).length > 0, "This address is not a valid laboratory");
        laboratories[_laboratoryAddress].isVerified = _status;
        emit LaboratoryVerified(_laboratoryAddress, _status);
    }

    /**
    * @dev Consulta la informació d'un laboratori
    * @param _laboratoryAddress Adreça del laboratori
    * @return name Nom del laboratori
    * @return isVerified Estat de la verificació del laboratori
    * @return exists Indica si el laboratori s'ha registrat
    */
    function getLaboratoryInfo(address _laboratoryAddress) external view returns (string memory name, bool isVerified, bool exists) {
        exists = (bytes(laboratories[_laboratoryAddress].name).length > 0);
        if (exists) {
            name = laboratories[_laboratoryAddress].name;
            isVerified = laboratories[_laboratoryAddress].isVerified;
        }
        return (name, isVerified, exists);
    }
    
    /**
    * @dev Afegeix o actualitza una acreditació a un laboratori específic. Només els auditors poden gastar aquesta funció. També actualitza acreditacions.
    * @param _laboratoryAddress Adreça del laboratori
    * @param _accreditationName Nom de la acreditació
    * @param _validFrom Timestamp de l'inici de validesa de l'acreditació
    * @param _validUntil Timestamp de final de validasa de l'acreditació
    */
    function addOrUpdateAccreditation(address _laboratoryAddress, string memory _accreditationName, uint256 _validFrom, uint256 _validUntil) external onlyAuditor {
        require(bytes(laboratories[_laboratoryAddress].name).length > 0, "This address is not a valid laboratory");
        require(_validFrom < _validUntil, "validFrom must be lower than validUntil");
        
        bytes32 accreditationHash = keccak256(abi.encode(_accreditationName));
        Laboratory storage lab = laboratories[_laboratoryAddress];

        bool exists = lab.accreditationsByHash[accreditationHash].validFrom != 0;

        // Actualitza el mapping per accedir ràpidament
        lab.accreditationsByHash[accreditationHash] = Accreditation(_accreditationName, _validFrom, _validUntil);

        if (!exists) {
            // Acreditació nova
            lab.accreditationList.push(Accreditation(_accreditationName, _validFrom, _validUntil));
            lab.accreditationExistsInList[accreditationHash] = true;
            emit AccreditationAdded(_laboratoryAddress, accreditationHash, _accreditationName);
        } else {
            // Actualització d'acreditació
            for (uint i = 0; i < lab.accreditationList.length; i++) {
                if (keccak256(abi.encode(lab.accreditationList[i].name)) == accreditationHash) {
                    lab.accreditationList[i].validFrom = _validFrom;
                    lab.accreditationList[i].validUntil = _validUntil;
                    emit AccreditationUpdated(_laboratoryAddress, accreditationHash, _accreditationName);
                    return; // No cal continuar buscant
                }
            }
        }
    }

    /**
    * @dev Revoca una acreditació d'un laboratori. Només auditors.
    * @param _laboratoryAddress L'adreça del laboratori
    * @param _accreditationName Nom de l'acreditació a revocar
    */
    function revokeAccreditation(address _laboratoryAddress, string memory _accreditationName) external onlyAuditor {
        require(bytes(laboratories[_laboratoryAddress].name).length > 0, "This address is not a valid laboratory");

        bytes32 accreditationHash = keccak256(abi.encode(_accreditationName));
        Laboratory storage lab = laboratories[_laboratoryAddress];

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
        emit AccreditationRevoked(_laboratoryAddress, accreditationHash);
    }

    /**
    * @dev Comprova si un laboratori concret té una acreditació indicada
    * @param _laboratoryAddress Adreça del laboratori
    * @param _accreditationName Nom de l'acreditació
    * @return bool True si existeix eixa acreditació per eixe laboratori
    */
    function hasValidAccreditation(address _laboratoryAddress, string memory _accreditationName) external view returns (bool) {
        bytes32 accreditationHash = keccak256(abi.encode(_accreditationName));
        Accreditation storage acc = laboratories[_laboratoryAddress].accreditationsByHash[accreditationHash];
        return (acc.validFrom != 0 && acc.validFrom <= block.timestamp && acc.validUntil >= block.timestamp);
    }

    /**
    * @dev Recuperar els detalls d'una acreditació concreta d'un laboratori
    * @param _laboratoryAddress Adreça del laboratori
    * @param _accreditationName Nom de l'acreditació
    * @return name Nom de l'acreditació
    * @return validFrom Timestamp d'inici de validesa
    * @return validUntil Timestamp de fi de validesa
    * @return exists True si existeix eixa acreditació per eixe laboratori
    */
    function getAccreditationDetails(address _laboratoryAddress, string memory _accreditationName) external view returns (string memory name, uint256 validFrom, uint256 validUntil, bool exists) {
        bytes32 accreditationHash = keccak256(abi.encode(_accreditationName));
        Accreditation storage acc = laboratories[_laboratoryAddress].accreditationsByHash[accreditationHash];

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
    * @param _laboratoryAddress Adreça del laboratori
    * @return Array de structs Accreditation amb tots els detalls
    */
    function getAllAccreditationsForLaboratory(address _laboratoryAddress) external view returns (Accreditation[] memory) {
        return laboratories[_laboratoryAddress].accreditationList;
    }
}
