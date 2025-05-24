let provider;
let signer;
let registryContract;
let connectedAccount = null;
let isAuditor = false;
let isOwner = false;

const resultDiv = document.getElementById('result');
const registryContractAddressInput = document.getElementById('registryContractAddress');
const connectedAccountDisplay = document.getElementById('connectedAccountDisplay');
const isAuditorStatus = document.getElementById('isAuditorStatus');
const isOwnerStatus = document.getElementById('isOwnerStatus');

// Funció genèrica per a mostrar missatges
function showStatus(elementId, message, isError = false, isInfo = false) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error(`Element with ID ${elementId} not found.`);
        return;
    }
    element.innerHTML = message;
    element.className = 'status-message'; // Reset classes
    if (isError) {
        element.classList.add('failure');
    } else if (isInfo) {
        element.classList.add('info');
    } else {
        element.classList.add('success');
    }
}

// Funció genèrica per a mostrar resultats
function showGeneralResult(message, isError = false) {
    resultDiv.textContent = message;
    resultDiv.className = isError ? 'error' : '';
}

// Inicialitzem el compte
window.addEventListener('load', async () => {
    if (typeof window.ethereum !== 'undefined') {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        try {
            const accounts = await provider.send("eth_requestAccounts", []);
            connectedAccount = accounts[0];
            signer = provider.getSigner(connectedAccount);
            connectedAccountDisplay.textContent = connectedAccount;
            showGeneralResult(`Ethers.js inicialitzat i connectat a MetaMask. Compte: ${connectedAccount}`);

            await updateAccountStatus();

            window.ethereum.on('accountsChanged', async (accounts) => {
                connectedAccount = accounts[0];
                signer = provider.getSigner(connectedAccount);
                connectedAccountDisplay.textContent = connectedAccount;
                showGeneralResult(`Compte de MetaMask canviat a: ${connectedAccount}`);
                await updateAccountStatus();
            });

        } catch (error) {
            showGeneralResult('Accés a MetaMask denegat. Algunes funcionalitats poden no estar disponibles.', true);
        }
    } else {
        showGeneralResult('No es detecta Ethereum en el navegador. Per favor, instal·la MetaMask o un altre proveïdor de Web3.', true);
    }
});

async function updateAccountStatus() {
    const contractAddress = registryContractAddressInput.value.trim();
    if (!ethers.utils.isAddress(contractAddress)) {
        isAuditorStatus.textContent = 'Adreça de contracte invàlida.';
        isOwnerStatus.textContent = 'Adreça de contracte invàlida.';
        return;
    }

    try {
        registryContract = new ethers.Contract(contractAddress, ACCREDITATION_REGISTRY_ABI, provider);
        isAuditor = await registryContract.isAuditor(connectedAccount);
        const ownerAddress = await registryContract.owner();
        isOwner = (connectedAccount.toLowerCase() === ownerAddress.toLowerCase());

        isAuditorStatus.textContent = isAuditor ? 'Sí' : 'No';
        isOwnerStatus.textContent = isOwner ? 'Sí' : 'No';

    } catch (error) {
        isAuditorStatus.textContent = 'Error al carregar';
        isOwnerStatus.textContent = 'Error al carregar';
        console.error("Error updating account status:", error);
    }
}

async function executeTransaction(contractFunction, successMessage, statusElementId, ...args) {
    if (!signer || !connectedAccount) {
        showStatus(statusElementId, 'Connecta el MetaMask primer.', true);
        return;
    }
    if (!registryContract) {
        const contractAddress = registryContractAddressInput.value.trim();
        if (!ethers.utils.isAddress(contractAddress)) {
            showStatus(statusElementId, 'L\'adreça del contracte AccreditationRegistry no és vàlida.', true);
            return;
        }
        registryContract = new ethers.Contract(contractAddress, ACCREDITATION_REGISTRY_ABI, provider);
    }

    showStatus(statusElementId, 'Enviant transacció. Espera la confirmació...', false);
    try {
        const contractWithSigner = registryContract.connect(signer);
        const tx = await contractFunction(contractWithSigner, ...args);
        showStatus(statusElementId, 'Transacció enviada. Esperant confirmació...', false);
        await tx.wait();
        showStatus(statusElementId, successMessage, false);
        await updateAccountStatus(); // Actualitzem la informació de owner/auditor
    } catch (error) {
        console.error(`Error executing transaction for ${contractFunction.name}:`, error);
        let errorMessage = error.message || 'Desconegut';
        if (error.code === 4001) {
            errorMessage = "Transacció rebutjada per l'usuari en MetaMask.";
        } else if (error.data && error.data.message) {
            errorMessage = error.data.message;
        } else if (error.reason) {
            errorMessage = error.reason;
        }
        showStatus(statusElementId, `Error: ${errorMessage}`, true);
    }
}

// Funcions per gestionar auditors
async function addAuditor() {
    const auditorAddress = document.getElementById('auditorAddressInput').value.trim();
    if (!ethers.utils.isAddress(auditorAddress)) {
        showStatus('auditorStatus', 'Adreça d\'auditor invàlida.', true);
        return;
    }
    if (!isOwner) {
        showStatus('auditorStatus', 'Només el propietari del contracte pot afegir auditors.', true);
        return;
    }
    await executeTransaction(async (contract, addr) => contract.addAuditor(addr),
        'Auditor afegit amb èxit!', 'auditorStatus', auditorAddress);
}

async function removeAuditor() {
    const auditorAddress = document.getElementById('auditorAddressInput').value.trim();
    if (!ethers.utils.isAddress(auditorAddress)) {
        showStatus('auditorStatus', 'Adreça d\'auditor invàlida.', true);
        return;
    }
    if (!isOwner) {
        showStatus('auditorStatus', 'Només el propietari del contracte pot eliminar auditors.', true);
        return;
    }
    await executeTransaction(async (contract, addr) => contract.removeAuditor(addr),
        'Auditor eliminat amb èxit!', 'auditorStatus', auditorAddress);
}

// Funcions per a gestionar laboratoris
async function addLaboratory() {
    const labAddress = document.getElementById('labAddressAddInput').value.trim();
    const labName = document.getElementById('labNameAddInput').value.trim();
    if (!ethers.utils.isAddress(labAddress) || !labName) {
        showStatus('addLabStatus', 'Adreça o nom del laboratori invàlids.', true);
        return;
    }
    await executeTransaction(async (contract, addr, name) => contract.addLaboratory(addr, name),
        'Laboratori afegit amb èxit!', 'addLabStatus', labAddress, labName);
}

async function setLaboratoryVerificationStatus() {
    const labAddress = document.getElementById('labAddressVerifyInput').value.trim();
    const status = document.getElementById('labVerificationStatusSelect').value === 'true';
    if (!ethers.utils.isAddress(labAddress)) {
        showStatus('verifyLabStatus', 'Adreça de laboratori invàlida.', true);
        return;
    }
    if (!isAuditor) {
        showStatus('verifyLabStatus', 'Només els auditors poden verificar laboratoris.', true);
        return;
    }
    await executeTransaction(async (contract, addr, stat) => contract.setLaboratoryVerificationStatus(addr, stat),
        'Estat de verificació del laboratori actualitzat!', 'verifyLabStatus', labAddress, status);
}

async function getLaboratoryInfo() {
    const labAddress = document.getElementById('labAddressInfoInput').value.trim();
    if (!ethers.utils.isAddress(labAddress)) {
        showStatus('labInfoDisplay', 'Adreça de laboratori invàlida.', true, true);
        return;
    }
    if (!registryContract) {
        const contractAddress = registryContractAddressInput.value.trim();
        if (!ethers.utils.isAddress(contractAddress)) {
            showStatus('labInfoDisplay', 'L\'adreça del contracte AccreditationRegistry no és vàlida.', true, true);
            return;
        }
        registryContract = new ethers.Contract(contractAddress, ACCREDITATION_REGISTRY_ABI, provider);
    }

    showStatus('labInfoDisplay', 'Obtenint informació del laboratori...', false, true);
    try {
        const [name, isVerified, exists] = await registryContract.getLaboratoryInfo(labAddress);
        let message = '';
        if (exists) {
            const verifiedClass = isVerified ? 'verified-status' : 'unverified-status';
            message = `Nom: ${name}<br>Verificat: <span class="${verifiedClass}">${isVerified ? 'Sí' : 'No'}</span>`;
        } else {
            message = `El laboratori ${labAddress} no existeix.`;
        }
        showStatus('labInfoDisplay', message, !exists, true);
    } catch (error) {
        console.error("Error getting laboratory info:", error);
        showStatus('labInfoDisplay', `Error: ${error.message || 'Desconegut'}`, true, true);
    }
}

// Funcions per a gestionar signataris
async function addModSigner() {
    const signerName = document.getElementById('signerNameInput').value.trim();
    if (!signerName) {
        showStatus('addSignerStatus', 'El nom del signatari no pot estar buit.', true);
        return;
    }
    await executeTransaction(async (contract, name) => contract.addModSigner(name),
        'Signatari afegit/modificat amb èxit!', 'addSignerStatus', signerName);
}

async function setSignerVerificationStatus() {
    const signerAddress = document.getElementById('signerAddressVerifyInput').value.trim();
    const status = document.getElementById('signerVerificationStatusSelect').value === 'true';
    console.log("STATUS", status);
    if (!ethers.utils.isAddress(signerAddress)) {
        showStatus('verifySignerStatus', 'Adreça de signatari invàlida.', true);
        return;
    }
    if (!isAuditor) {
        showStatus('verifySignerStatus', 'Només els auditors poden verificar signataris.', true);
        return;
    }
    await executeTransaction(async (contract, addr, stat) => contract.setSignerVerificationStatus(addr, stat),
        'Estat de verificació del signatari actualitzat!', 'verifySignerStatus', signerAddress, status);
}

// Funcions per a gestionar acreditacions
async function addModAccreditation() {
    const labAddress = document.getElementById('accLabAddressInput').value.trim();
    const accName = document.getElementById('accNameInput').value.trim();
    const validFromDate = document.getElementById('accValidFromInput').value;
    const validUntilDate = document.getElementById('accValidUntilInput').value;

    if (!ethers.utils.isAddress(labAddress) || !accName || !validFromDate || !validUntilDate) {
        showStatus('addAccreditationStatus', 'Tots els camps d\'acreditació són obligatoris.', true);
        return;
    }

    const validFromTimestamp = Math.floor(new Date(validFromDate).getTime() / 1000);
    const validUntilTimestamp = Math.floor(new Date(validUntilDate).getTime() / 1000);

    if (validFromTimestamp >= validUntilTimestamp) {
        showStatus('addAccreditationStatus', 'La data "Vàlid Des de" ha de ser anterior a "Vàlid Fins a".', true);
        return;
    }
    if (!isAuditor) {
        showStatus('addAccreditationStatus', 'Només els auditors poden afegir/actualitzar acreditacions.', true);
        return;
    }

    await executeTransaction(async (contract, labAddr, name, from, until) => contract.addModAccreditation(labAddr, name, from, until),
        'Acreditació afegida/actualitzada amb èxit!', 'addAccreditationStatus', labAddress, accName, validFromTimestamp, validUntilTimestamp);
}

async function revokeAccreditation() {
    const labAddress = document.getElementById('revokeAccLabAddressInput').value.trim();
    const accName = document.getElementById('revokeAccNameInput').value.trim();

    if (!ethers.utils.isAddress(labAddress) || !accName) {
        showStatus('revokeAccreditationStatus', 'Adreça de laboratori o nom d\'acreditació invàlids.', true);
        return;
    }
    if (!isAuditor) {
        showStatus('revokeAccreditationStatus', 'Només els auditors poden revocar acreditacions.', true);
        return;
    }

    await executeTransaction(async (contract, labAddr, name) => contract.revokeAccreditation(labAddr, name),
        'Acreditació revocada amb èxit!', 'revokeAccreditationStatus', labAddress, accName);
}

async function hasValidAccreditation() {
    const labAddress = document.getElementById('checkAccLabAddressInput').value.trim();
    const accName = document.getElementById('checkAccNameInput').value.trim();

    if (!ethers.utils.isAddress(labAddress) || !accName) {
        showStatus('checkAccreditationStatus', 'Adreça de laboratori o nom d\'acreditació invàlids.', true, true);
        return;
    }
    if (!registryContract) {
        const contractAddress = registryContractAddressInput.value.trim();
        if (!ethers.utils.isAddress(contractAddress)) {
            showStatus('checkAccreditationStatus', 'L\'adreça del contracte AccreditationRegistry no és vàlida.', true, true);
            return;
        }
        registryContract = new ethers.Contract(contractAddress, ACCREDITATION_REGISTRY_ABI, provider);
    }

    showStatus('checkAccreditationStatus', 'Comprovant validesa de l\'acreditació...', false, true);
    try {
        const isValid = await registryContract.hasValidAccreditation(labAddress, accName);
        let message = `L'acreditació "${accName}" per a ${labAddress} és <span class="${isValid ? 'accreditation-valid' : 'accreditation-invalid'}">${isValid ? 'VÀLIDA' : 'INVÀLIDA'}</span>.`;
        showStatus('checkAccreditationStatus', message, false, true);
    } catch (error) {
        console.error("Error checking valid accreditation:", error);
        showStatus('checkAccreditationStatus', `Error: ${error.message || 'Desconegut'}`, true, true);
    }
}

async function getAccreditationDetails() {
    const labAddress = document.getElementById('getAccDetailsLabAddressInput').value.trim();
    const accName = document.getElementById('getAccDetailsNameInput').value.trim();

    if (!ethers.utils.isAddress(labAddress) || !accName) {
        showStatus('accDetailsDisplay', 'Adreça de laboratori o nom d\'acreditació invàlids.', true, true);
        return;
    }
    if (!registryContract) {
        const contractAddress = registryContractAddressInput.value.trim();
        if (!ethers.utils.isAddress(contractAddress)) {
            showStatus('accDetailsDisplay', 'L\'adreça del contracte AccreditationRegistry no és vàlida.', true, true);
            return;
        }
        registryContract = new ethers.Contract(contractAddress, ACCREDITATION_REGISTRY_ABI, provider);
    }

    showStatus('accDetailsDisplay', 'Obtenint detalls de l\'acreditació...', false, true);
    try {
        const [name, validFrom, validUntil, exists] = await registryContract.getAccreditationDetails(labAddress, accName);
        let message = '';
        if (exists) {
            const validFromDate = new Date(parseInt(validFrom.toString()) * 1000).toLocaleDateString();
            const validUntilDate = new Date(parseInt(validUntil.toString()) * 1000).toLocaleDateString();
            message = `Nom: ${name}<br>Vàlid Des de: ${validFromDate}<br>Vàlid Fins a: ${validUntilDate}`;
        } else {
            message = `L'acreditació "${accName}" no existeix per al laboratori ${labAddress}.`;
        }
        showStatus('accDetailsDisplay', message, !exists, true);
    } catch (error) {
        console.error("Error getting accreditation details:", error);
        showStatus('accDetailsDisplay', `Error: ${error.message || 'Desconegut'}`, true, true);
    }
}

async function getAllAccreditationsForLaboratory() {
    const labAddress = document.getElementById('getAllAccLabAddressInput').value.trim();
    if (!ethers.utils.isAddress(labAddress)) {
        showStatus('allAccreditationsDisplay', 'Adreça de laboratori invàlida.', true, true);
        return;
    }
    if (!registryContract) {
        const contractAddress = registryContractAddressInput.value.trim();
        if (!ethers.utils.isAddress(contractAddress)) {
            showStatus('allAccreditationsDisplay', 'L\'adreça del contracte AccreditationRegistry no és vàlida.', true, true);
            return;
        }
        registryContract = new ethers.Contract(contractAddress, ACCREDITATION_REGISTRY_ABI, provider);
    }

    showStatus('allAccreditationsDisplay', 'Obtenint totes les acreditacions...', false, true);
    try {
        const accreditations = await registryContract.getAllAccreditationsForLaboratory(labAddress);
        let message = '';
        if (accreditations.length > 0) {
            message += `Acreditacions per a ${labAddress}:<br>`;
            const currentTimestamp = Math.floor(Date.now() / 1000);
            accreditations.forEach(acc => {
                const validFromDate = new Date(parseInt(acc.validFrom.toString()) * 1000).toLocaleDateString();
                const validUntilDate = new Date(parseInt(acc.validUntil.toString()) * 1000).toLocaleDateString();
                const isValid = (parseInt(acc.validFrom.toString()) <= currentTimestamp && parseInt(acc.validUntil.toString()) >= currentTimestamp);
                const statusClass = isValid ? 'accreditation-valid' : 'accreditation-invalid';
                message += `- <span class="${statusClass}">${acc.name}</span> (De: ${validFromDate} A: ${validUntilDate})<br>`;
            });
        } else {
            message = `No s'han trobat acreditacions per al laboratori ${labAddress}.`;
        }
        showStatus('allAccreditationsDisplay', message, false, true);
    } catch (error) {
        console.error("Error getting all accreditations:", error);
        showStatus('allAccreditationsDisplay', `Error: ${error.message || 'Desconegut'}`, true, true);
    }
}
