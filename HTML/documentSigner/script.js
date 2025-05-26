let provider;
let signer;
let documentSignerContract;
let accreditationRegistryContract;
let currentDocumentHash = '';
let connectedAccount = null;
let currentMode = 'solitary'; // 'solitary' o 'api'

// Variables d'estat per a la signatura en 3 passos
let signingDocHash = '';
let generatedSignature = '';
let signerAddressEIP712 = '';
let nonceForEIP712Signature = 0;


const resultDiv = document.getElementById('result');
const signersUl = document.getElementById('signersUl');
const documentSignerContractAddressInput = document.getElementById('documentSignerContractAddress');
const accreditationRegistryContractAddressInput = document.getElementById('accreditationRegistryContractAddress');

// Elements de la secció de signatura
const signDocumentFileInput = document.getElementById('signDocumentFile');
const documentHashToSignInput = document.getElementById('documentHashToSign');
const signerAccountForEIP712Span = document.getElementById('signerAccountForEIP712');
const generateSignatureBtn = document.getElementById('generateSignatureBtn');
const signatureDisplayTextArea = document.getElementById('signatureDisplay');
const signerAddressForSignInput = document.getElementById('signerAddressForSign');
const txSenderAccountSpan = document.getElementById('txSenderAccount');
const sendSignTxBtn = document.getElementById('sendSignTxBtn');
const signingStatusDiv = document.getElementById('signingStatus');

// Elements del toggle de mode
const modeToggleCheckbox = document.getElementById('modeToggle');


// Funció per a mostrar missatges en el resultat general
function showResult(message, isError = false) {
    resultDiv.textContent = message;
    resultDiv.className = isError ? 'error' : '';
}

// Funció per a mostrar missatges específics en la secció de signatura
function showSigningStatus(message, isError = false) {
    signingStatusDiv.textContent = message;
    signingStatusDiv.className = isError ? 'signing-status failure' : 'signing-status success';
}

// Funció per a mostrar missatges específics de l'info del laboratori
function showLabInfoStatus(targetElement, message, isError = false) {
    let statusDiv = targetElement.nextElementSibling;
    if (!statusDiv || !statusDiv.classList.contains('lab-info-status')) {
        statusDiv = document.createElement('div');
        statusDiv.className = 'lab-info-status';
        targetElement.parentNode.insertBefore(statusDiv, targetElement.nextSibling);
    }

    statusDiv.innerHTML = message;
    statusDiv.classList.toggle('failure', isError);
    statusDiv.classList.toggle('success', !isError && message !== '');
    statusDiv.classList.toggle('info', !isError && message !== '');
}

// Funció per a canviar el mode (Solitari / API)
function toggleMode() {
    if (modeToggleCheckbox.checked) {
        currentMode = 'api';
        document.body.classList.remove('mode-solitary');
        document.body.classList.add('mode-api');
        showResult('Mode API activat. Les transaccions s\'enviaran a http://127.0.0.1:8888.', false);
    } else {
        currentMode = 'solitary';
        document.body.classList.remove('mode-api');
        document.body.classList.add('mode-solitary');
        showResult('Mode Solitari activat. Les transaccions s\'enviaran via MetaMask.', false);
    }
    if (currentDocumentHash && documentSignerContract) {
        updateInvalidateButtonsState();
    }
}


// Inicialitzar Ethers.js i el mode
window.addEventListener('load', async () => {
    toggleMode();

    if (typeof window.ethereum !== 'undefined') {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        try {
            const accounts = await provider.send("eth_requestAccounts", []);
            connectedAccount = accounts[0];
            signer = provider.getSigner(connectedAccount);
            showResult(`Ethers.js inicialitzat i connectat a MetaMask. Compte: ${connectedAccount}`);
            txSenderAccountSpan.textContent = connectedAccount;
            signerAccountForEIP712Span.textContent = connectedAccount;

            if (signDocumentFileInput.files.length > 0) {
                generateSignatureBtn.disabled = false;
            }

            window.ethereum.on('accountsChanged', (accounts) => {
                console.log("ACC", accounts);
                connectedAccount = accounts[0];
                signer = provider.getSigner(connectedAccount);
                showResult(`Compte de MetaMask canviat a: ${connectedAccount}`);
                txSenderAccountSpan.textContent = connectedAccount;
                signerAccountForEIP712Span.textContent = connectedAccount;

                if (currentDocumentHash && documentSignerContract) {
                    updateInvalidateButtonsState();
                }
            });

        } catch (error) {
            showResult('Accés a MetaMask denegat. Algunes funcionalitats poden no estar disponibles.', true);
            console.error("User denied account access", error);
        }
    } else {
        showResult('No es detecta Ethereum en el navegador. Per favor, instal·la MetaMask o un altre proveïdor de Web3.', true);
        console.error("No Ethereum provider detected.");
    }
});

// Funció per a calcular el hash Keccak256 d'un fitxer
async function calculateFileHash(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const buffer = event.target.result;
                const uint8Array = new Uint8Array(buffer);

                const hashHex = ethers.utils.keccak256(uint8Array);
                resolve(hashHex);
            } catch (error) {
                reject('Error en calcular el hash Keccak256: ' + error.message);
            }
        };
        reader.onerror = (error) => {
            reject('Error en llegir el fitxer: ' + error.message);
        };
        reader.readAsArrayBuffer(file);
    });
}

// --- FUNCIONS PER A LA SECCIÓ DE SIGNATURA DE DOCUMENTS (3 passos) ---

// Pas 1: Seleccionar fitxer i mostrar hash
async function step1_selectFileAndHash() {
    const file = signDocumentFileInput.files[0];
    if (!file) {
        documentHashToSignInput.value = '';
        generateSignatureBtn.disabled = true;
        return;
    }

    showSigningStatus('Calculant hash Keccak256 del document...', false);
    try {
        signingDocHash = await calculateFileHash(file);
        documentHashToSignInput.value = signingDocHash;
        showSigningStatus(`Hash del document calculat: ${signingDocHash}`, false);
        generateSignatureBtn.disabled = false; // Habilitar Pas 2
        signatureDisplayTextArea.value = ''; // Netejar signatura anterior
        generatedSignature = '';
        sendSignTxBtn.disabled = true; // Deshabilitar Pas 3
    } catch (error) {
        showSigningStatus(`Error en calcular el hash: ${error.message}`, true);
        documentHashToSignInput.value = '';
        generateSignatureBtn.disabled = true;
    }
}

// Pas 2: Generar la signatura EIP-712
async function step2_generateEIP712Signature() {
    if (!signer || !connectedAccount) {
        showSigningStatus('Connecta el teu MetaMask primer.', true);
        return;
    }
    if (!signingDocHash) {
        showSigningStatus('Primer selecciona un document i calcula el seu hash (Pas 1).', true);
        return;
    }
    const contractAddress = documentSignerContractAddressInput.value.trim();
    if (!ethers.utils.isAddress(contractAddress)) {
        showSigningStatus('L\'adreça del contracte DocumentSigner no és vàlida.', true);
        return;
    }

    showSigningStatus('Obtenint nonce i preparant la signatura EIP-712...', false);
    try {
        documentSignerContract = new ethers.Contract(contractAddress, DOCUMENT_SIGNER_ABI, provider);

        const nonceForEIP712Signature = await documentSignerContract.nonce(connectedAccount);

        signerAddressEIP712 = connectedAccount;

        const domain = {
            name: 'DocumentSigner',
            version: '1.0.0',
            chainId: (await provider.getNetwork()).chainId,
            verifyingContract: contractAddress,
        };

        const types = {
            Document: [
                { name: 'contentHash', type: 'bytes32' },
                { name: 'nonce', type: 'uint32' }
            ],
        };

        const message = {
            contentHash: signingDocHash,
            nonce: nonceForEIP712Signature,
        };

        generatedSignature = await signer._signTypedData(domain, types, message);
        signatureDisplayTextArea.value = generatedSignature;
        signerAddressForSignInput.value = signerAddressEIP712;

        showSigningStatus(`Signatura EIP-712 generada amb èxit per ${signerAddressEIP712}.`, false);
        sendSignTxBtn.disabled = false;

    } catch (error) {
        console.error("Error en generar la signatura EIP-712:", error);
        showSigningStatus(`Error en generar la signatura EIP-712: ${error.message || 'Desconegut'}. ${error.code === 4001 ? 'Transacció rebutjada per l\'usuari.' : ''}`, true);
        generatedSignature = '';
        signatureDisplayTextArea.value = '';
        signerAddressForSignInput.value = '';
        sendSignTxBtn.disabled = true;
    }
}

// Pas 3: Enviar la transacció de signatura al contracte
async function step3_sendSignTransaction() {
    if (!generatedSignature || !signerAddressEIP712 || !signingDocHash) {
        showSigningStatus('Primer completa els passos 1 i 2.', true);
        return;
    }
    if (!signer || !connectedAccount) {
        showSigningStatus('Connecta el teu MetaMask per a enviar la transacció.', true);
        return;
    }
    const contractAddress = documentSignerContractAddressInput.value.trim();
    if (!ethers.utils.isAddress(contractAddress)) {
        showSigningStatus('L\'adreça del contracte DocumentSigner no és vàlida.', true);
        return;
    }

    showSigningStatus(`Enviant transacció de signatura des de ${connectedAccount}...`, false);
    sendSignTxBtn.disabled = true;

    try {
        if (currentMode === 'solitary') {
            const contractWithTxSigner = new ethers.Contract(contractAddress, DOCUMENT_SIGNER_ABI, signer);
            const tx = await contractWithTxSigner.signDocument(
                signingDocHash,
                signerAddressEIP712,
                generatedSignature
            );
            showSigningStatus('Transacció de signatura enviada. Esperant confirmació...', false);
            await tx.wait();
            showSigningStatus('Document signat amb èxit a la blockchain!', false);

        } else {
            const apiEndpoint = 'http://127.0.0.1:8888/sign_document_contract';
            const payload = {
                document_hash: signingDocHash,
                signer_address: ethers.utils.getAddress(signerAddressEIP712),
                signature: generatedSignature
            };

            showSigningStatus(`Enviant dades a l'API REST: ${apiEndpoint}...`, false);
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                        'Content-type':'application/json',
                        'Accept':'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const responseData = await response.json();
            showSigningStatus(`Resposta de l'API: ${JSON.stringify(responseData)}`, false);
            showSigningStatus('Document signat amb èxit a través de l\'API!', false);
        }

        signDocumentFileInput.value = '';
        documentHashToSignInput.value = '';
        signatureDisplayTextArea.value = '';
        signerAddressForSignInput.value = '';
        generatedSignature = '';
        signingDocHash = '';
        signerAddressEIP712 = '';
        nonceForEIP712Signature = 0;
        generateSignatureBtn.disabled = true;
        sendSignTxBtn.disabled = true;

        setTimeout(() => getAndDisplaySigners(), 2000);

    } catch (error) {
        console.error("Error en enviar la transacció de signatura:", error);
        let errorMessage = error.message || 'Desconegut';
        if (error.code === 4001) {
            errorMessage = "Transacció rebutjada per l'usuari en MetaMask.";
        } else if (error.data && error.data.message) {
            errorMessage = error.data.message;
        } else if (error.reason) {
            errorMessage = error.reason;
        }
        showSigningStatus(`Error en enviar la transacció: ${errorMessage}`, true);
        sendSignTxBtn.disabled = false;
    }
}


// --- FUNCIONS PER A LA SECCIÓ DE VERIFICACIÓ/ELIMINACIÓ ---

// Funció per a obtindre i mostrar els firmants
async function getAndDisplaySigners() {
    if (!provider) {
        showResult('Ethers.js no està inicialitzat. Per favor, recarrega la pàgina i intenta de nou.', true);
        return;
    }

    const fileInput = document.getElementById('documentFile');
    const contractAddress = documentSignerContractAddressInput.value.trim();

    if (!fileInput.files.length) {
        showResult('Per favor, selecciona un fitxer.', true);
        return;
    }
    if (!ethers.utils.isAddress(contractAddress)) {
        showResult('L\'adreça del contracte DocumentSigner no és vàlida.', true);
        return;
    }

    showResult('Calculant hash Keccak256 del document...');
    const file = fileInput.files[0];

    try {
        currentDocumentHash = await calculateFileHash(file);
        showResult(`Hash del document calculat (Keccak256): ${currentDocumentHash}. Obtenint firmants...`);

        documentSignerContract = new ethers.Contract(contractAddress, DOCUMENT_SIGNER_ABI, provider);

        const signers = await documentSignerContract.getSigners(currentDocumentHash);

        displaySigners(signers);

        showResult(`S'han obtingut ${signers.length} firmants per al document.`);

    } catch (error) {
        console.error("Error en obtindre firmants:", error);
        showResult(`Error en obtindre firmants: ${error.message || error}. Assegura't que el contracte estiga desplegat i accessible, i el hash del document siga correcte.`, true);
        signersUl.innerHTML = '';
    }
}

// Funció per a verificar una signatura individual
async function verifyStoredSignerSignature(signerAddress, buttonElement) {
    if (!documentSignerContract || !currentDocumentHash) {
        showResult('Primer, obtén els signants d\'un document.', true);
        return;
    }

    const initialButtonText = buttonElement.textContent;
    buttonElement.textContent = 'Verificant...';
    buttonElement.disabled = true;

    const existingStatus = buttonElement.parentNode.querySelector('.verification-status');
    if (existingStatus) {
        existingStatus.remove();
    }

    const signerSpan = buttonElement.parentNode.parentNode.querySelector('span:first-of-type');
    const originalSignerAddressText = `<strong>Signatari:</strong> ${signerAddress}`; // Guardar l'estat original

    try {
        const isValid = await documentSignerContract.verifyStoredSignature(currentDocumentHash, signerAddress);

        if (isValid) {
            buttonElement.textContent = 'Vàlida';
            buttonElement.classList.remove('verify-button');
            buttonElement.classList.add('verify-button', 'valid');

            // Obtenir i mostrar informació del signant (persona) ---
            const registryAddress = accreditationRegistryContractAddressInput.value.trim();
            if (ethers.utils.isAddress(registryAddress)) {
                accreditationRegistryContract = new ethers.Contract(registryAddress, ACCREDITATION_REGISTRY_ABI, provider);
                try {
                    // La funció 'signers' del contracte AccreditationRegistry que retorna la struct Signer
                    const signerInfo = await accreditationRegistryContract.signers(signerAddress);
                    let signerName = signerInfo.name;
                    let isSignerVerified = signerInfo.isVerified;
                    let signerExists = (signerInfo.signerAddress != ethers.constants.AddressZero); // Comprovar si el signer existeix al registre
                    if (signerExists && signerName && signerName.length > 0) {
                        const nameClass = isSignerVerified ? 'signer-name-verified' : 'signer-name-unverified';
                        signerSpan.innerHTML = `<strong>Signatari:</strong> ${signerAddress} <span class="${nameClass}">(${signerName}${isSignerVerified ? ' - Verificat' : ' - No Verificat'})</span>`;
                    } else {
                        // Si no hi ha nom de signer al registre o el signer no existeix
                        signerSpan.innerHTML = `<strong>Signatari:</strong> ${signerAddress} <span class="signer-name-unverified">(Signatari no registrat i no verificat)</span>`;
                    }
                } catch (signerError) {
                    console.warn(`No s'ha pogut obtenir informació detallada del signer (${signerAddress}) des d'AccreditationRegistry:`, signerError);
                    signerSpan.innerHTML = `<strong>Signatari:</strong> ${signerAddress} <span class="signer-name-unverified">(Error al carregar info del signer)</span>`;
                }
            } else {
                console.warn('Adreça del contracte AccreditationRegistry no vàlida, no es pot consultar la informació del signer.');
            }

        } else {
            const verificationStatusDiv = document.createElement('div');
            verificationStatusDiv.className = 'verification-status failure';
            verificationStatusDiv.textContent = 'Signatura Invàlida.';
            buttonElement.parentNode.appendChild(verificationStatusDiv);
        }
    } catch (error) {
        console.error("Error en verificar la signatura:", error);
        const verificationStatusDiv = document.createElement('div');
        verificationStatusDiv.className = 'verification-status failure';
        verificationStatusDiv.textContent = `Error: ${error.message || 'Desconegut'}`;
        buttonElement.parentNode.appendChild(verificationStatusDiv);
    } finally {
        buttonElement.disabled = false;
    }
}

// Funció per a invalidar una signatura
async function invalidateSignerSignature(signerAddress, buttonElement) {
    if (!documentSignerContract || !currentDocumentHash || !signer || !connectedAccount) {
        showResult('Assegura\'t que Ethers.js estiga connectat i s\'haja carregat un document.', true);
        return;
    }

    if (signerAddress.toLowerCase() !== connectedAccount.toLowerCase()) {
        showResult('No pots invalidar una signatura que no et pertany.', true);
        return;
    }

    const initialButtonText = buttonElement.textContent;
    buttonElement.textContent = 'Invalidant...';
    buttonElement.disabled = true;

    const invalidationStatusDiv = document.createElement('div');
    invalidationStatusDiv.className = 'invalidation-status';

    try {
        const currentNonce = await documentSignerContract.nonce(signerAddress);

        showResult(`Obtingut nonce ${currentNonce} per a ${signerAddress}. Preparant signatura EIP-712 per a invalidació...`);

        const domain = {
            name: 'DocumentSigner',
            version: '1.0.0',
            chainId: (await provider.getNetwork()).chainId,
            verifyingContract: documentSignerContract.address,
        };

        const types = {
            Document: [
                { name: 'contentHash', type: 'bytes32' },
                { name: 'nonce', type: 'uint32' }
            ],
        };

        const message = {
            contentHash: currentDocumentHash,
            nonce: currentNonce,
        };

        const signature = await signer._signTypedData(domain, types, message);

        if (currentMode === 'solitary') {
            showResult(`Signatura EIP-712 generada. Enviant transacció d'invalidació via MetaMask...`);
            const contractWithSigner = documentSignerContract.connect(signer);
            const tx = await contractWithSigner.invalidateSignature(
                currentDocumentHash,
                signerAddress,
                signature
            );
            showResult('Transacció d\'invalidació enviada. Esperant confirmació...', false);
            await tx.wait();
            invalidationStatusDiv.classList.add('success');
            invalidationStatusDiv.textContent = '¡Signatura invalidada amb èxit!';
        } else {
            const apiEndpoint = 'http://127.0.0.1:8888/invalidate_signature_contract';
            const payload = {
                document_hash: currentDocumentHash,
                signer_address: signerAddress,
                signature: signature
            };

            showResult(`Signatura EIP-712 generada. Enviant dades a l'API REST: ${apiEndpoint}...`, false);
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const responseData = await response.json();
            invalidationStatusDiv.classList.add('success');
            invalidationStatusDiv.textContent = `¡Signatura invalidada amb èxit via API! Resposta: ${JSON.stringify(responseData)}`;
        }

        showResult('Signatura invalidada. Recarregant la llista de firmants...', false);
        setTimeout(() => getAndDisplaySigners(), 2000);

    } catch (error) {
        console.error("Error en invalidar la signatura:", error);
        invalidationStatusDiv.classList.add('failure');
        let errorMessage = error.message || 'Desconegut';
        if (error.code === 4001) {
            errorMessage = "Transacció rebutjada per l'usuari en MetaMask.";
        } else if (error.data && error.data.message) {
            errorMessage = error.data.message;
        } else if (error.reason) {
            errorMessage = error.reason;
        }
        invalidationStatusDiv.textContent = `Error: ${errorMessage}`;
        showResult(`Error en invalidar signatura: ${errorMessage}`, true);

    } finally {
        buttonElement.textContent = initialButtonText;
        buttonElement.disabled = false;
        const existingStatus = buttonElement.parentNode.querySelector('.invalidation-status');
        if (existingStatus) {
            existingStatus.remove();
        }
        buttonElement.parentNode.appendChild(invalidationStatusDiv);
    }
}

// Funció per a mostrar la informació del laboratori
async function showLaboratoryInfo(laboratoryAddress, buttonElement) {
    const registryAddress = accreditationRegistryContractAddressInput.value.trim();
    if (!ethers.utils.isAddress(registryAddress)) {
        showLabInfoStatus(buttonElement, 'L\'adreça del contracte AccreditationRegistry no és vàlida.', true);
        return;
    }

    if (!provider) {
        showLabInfoStatus(buttonElement, 'Ethers.js no està inicialitzat.', true);
        return;
    }

    const initialButtonText = buttonElement.textContent;
    buttonElement.textContent = 'Carregant info...';
    buttonElement.disabled = true;

    const existingLabInfoStatus = buttonElement.parentNode.querySelector('.lab-info-status');
    if (existingLabInfoStatus) {
        existingLabInfoStatus.remove();
    }

    try {
        accreditationRegistryContract = new ethers.Contract(registryAddress, ACCREDITATION_REGISTRY_ABI, provider);
        const [labName, isVerified, labExists] = await accreditationRegistryContract.getLaboratoryInfo(laboratoryAddress);

        let infoMessage = '';
        if (labExists) {
            const verifiedClass = isVerified ? 'lab-status-verified' : 'lab-status-unverified';
            infoMessage += `Nom: ${labName}<br><span class="${verifiedClass}">Verificat: ${isVerified ? 'Sí' : 'No'}</span><br>`;

            const accreditations = await accreditationRegistryContract.getAllAccreditationsForLaboratory(laboratoryAddress);
            const currentTimestamp = Math.floor(Date.now() / 1000);

            if (accreditations.length > 0) {
                infoMessage += "<br>Acreditacions:<br>";
                accreditations.forEach(acc => {
                    const validFromDate = new Date(parseInt(acc.validFrom.toString()) * 1000);
                    const validUntilDate = new Date(parseInt(acc.validUntil.toString()) * 1000);

                    const isValidAccreditation = (acc.validFrom <= currentTimestamp && acc.validUntil >= currentTimestamp);
                    const accreditationClass = isValidAccreditation ? 'accreditation-valid' : 'accreditation-invalid';

                    infoMessage += ` - <span class="${accreditationClass}">${acc.name} (De: ${validFromDate.toLocaleDateString()} A: ${validUntilDate.toLocaleDateString()})</span><br>`;
                });
                showLabInfoStatus(buttonElement, infoMessage, false);
            } else {
                infoMessage += "<br>Acreditacions: Cap acreditació trobada per a este laboratori.";
                showLabInfoStatus(buttonElement, infoMessage, false);
            }
        } else {
            infoMessage = `El laboratori ${laboratoryAddress} no existeix en el registre d'acreditacions.`;
            showLabInfoStatus(buttonElement, infoMessage, true);
        }
    } catch (error) {
        console.error("Error en obtenir informació del laboratori o les seues acreditacions:", error);
        showLabInfoStatus(buttonElement, `Error: ${error.message || 'Desconegut'}`, true);
    } finally {
        buttonElement.textContent = initialButtonText;
        buttonElement.disabled = false;
    }
}


// Funció per a actualitzar l'estat dels botons d'invalidació
function updateInvalidateButtonsState() {
    const signerItems = signersUl.children;
    for (let i = 0; i < signerItems.length; i++) {
        const li = signerItems[i];
        const signerAddressSpan = li.querySelector('span:first-of-type');
        const signerAddressText = signerAddressSpan.textContent;
        const currentSignerAddress = signerAddressText.split(':')[1].split('(')[0].trim();

        const invalidateButton = li.querySelector('.invalidate-button');
        const verifyButton = li.querySelector('.verify-button');
        const labInfoButton = li.querySelector('.lab-info-button');

        if (invalidateButton) {
            if (connectedAccount && currentSignerAddress.toLowerCase() === connectedAccount.toLowerCase()) {
                invalidateButton.disabled = false;
                invalidateButton.title = "";
                invalidateButton.onclick = () => invalidateSignerSignature(currentSignerAddress, invalidateButton);
            } else {
                invalidateButton.disabled = true;
                invalidateButton.title = "Només el firmant pot invalidar la seua pròpia signatura.";
                invalidateButton.onclick = null;
            }
        }

        // Reiniciem el botó
        if (verifyButton) {
            verifyButton.textContent = 'Verificar Signatura Emmagatzemada';
            verifyButton.classList.remove('valid');
            const existingStatus = verifyButton.parentNode.querySelector('.verification-status');
            if (existingStatus) {
                existingStatus.remove();
            }
            // Reiniciar el contingut del span
            signerAddressSpan.innerHTML = `<strong>Signatari:</strong> ${currentSignerAddress}`;
        }

        // Netegem laboratori
        const existingLabInfoStatus = li.querySelector('.lab-info-status');
        if (existingLabInfoStatus) {
            existingLabInfoStatus.remove();
        }
    }
}


// Funció per a mostrar els firmants en la interfície
function displaySigners(signers) {
    signersUl.innerHTML = '';

    if (signers.length === 0) {
        signersUl.innerHTML = '<li style="color: #666;">No hi ha firmants registrats per a este document.</li>';
        return;
    }

    signers.forEach(signerInfo => {
        const li = document.createElement('li');
        li.className = 'signer-item';

        const timestampDate = new Date(parseInt(signerInfo.timestamp.toString()) * 1000);

        li.innerHTML = `
            <span><strong>Signatari:</strong> ${signerInfo.signer}</span>
            <span><strong>Data de Signatura:</strong> ${timestampDate.toLocaleString()}</span>
            <span><strong>Adreça de transacció (laboratori):</strong> ${signerInfo.sender}</span>
            <div class="action-buttons">
                <button class="verify-button">Verificar Signatura Emmagatzemada</button>
                <button class="invalidate-button">Invalidar Signatura</button>
                <button class="lab-info-button">Veure Info Laboratori</button>
            </div>
        `;

        const verifyButton = li.querySelector('.verify-button');
        verifyButton.onclick = () => verifyStoredSignerSignature(signerInfo.signer, verifyButton);

        const invalidateButton = li.querySelector('.invalidate-button');
        if (connectedAccount && signerInfo.signer.toLowerCase() === connectedAccount.toLowerCase()) {
            invalidateButton.disabled = false;
            invalidateButton.onclick = () => invalidateSignerSignature(signerInfo.signer, invalidateButton);
            invalidateButton.title = "";
        } else {
            invalidateButton.disabled = true;
            invalidateButton.title = "Només el firmant pot invalidar la seua pròpia signatura.";
            invalidateButton.onclick = null;
        }

        const labInfoButton = li.querySelector('.lab-info-button');
        labInfoButton.onclick = () => showLaboratoryInfo(signerInfo.sender, labInfoButton);

        signersUl.appendChild(li);
    });
}
