#pip install web3 eth_account flask flask_cors

import os
from web3 import Web3
from eth_account import Account
from flask import Flask, request, jsonify
from flask_cors import CORS 


# Configuració inicial
HOST = "127.0.0.1"
PORT = "8888"
SECRET_FILE = "secret.txt"
ETHEREUM_NODE_URL = "https://sepolia.infura.io/v3/8e1b59cd37f84abd83c398883cac8294"  
CONTRACT_ADDRESS = "0xc4CE88Db5D099CD68C5cb2554c2A54f4a90a111c"  
CONTRACT_ABI = [
    {
        "inputs": [
            {"internalType": "bytes32", "name": "documentHash", "type": "bytes32"},
            {"internalType": "address", "name": "signer", "type": "address"},
            {"internalType": "bytes", "name": "signature", "type": "bytes"}
        ],
        "name": "signDocument",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "bytes32", "name": "documentHash", "type": "bytes32"},
            {"internalType": "address", "name": "signer", "type": "address"},
            {"internalType": "bytes", "name": "signature", "type": "bytes"}
        ],
        "name": "invalidateSignature",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]


def get_or_create_ethereum_key():
    """
    Si existeix una clau privada a SECRET_FILE, gasta aquesta. En cas contrari genera una nova.
    Retorna la clau privada generada o recuperada.
    """
    private_key = None
    account_address = None

    if os.path.exists(SECRET_FILE) and os.path.getsize(SECRET_FILE) > 0:
        with open(SECRET_FILE, "r") as f:
            private_key = f.read().strip()
            if private_key:
                try:
                    # Try to derive address to validate key
                    account = Account.from_key(private_key)
                    account_address = account.address
                    print("Clau de compte recuperat i carregat.")
                except Exception as e:
                    print(f"Error al carregar la clau emmagatzemada: {e}. Generant una nova.")
                    private_key = None # Invalidate existing key if it's bad
    
    if private_key is None: # If no valid key was loaded or if it was invalid
        print("No hi ha clau generada, generant una de nova...")
        account = Account.create()
        private_key = account.key.hex()
        account_address = account.address
        with open(SECRET_FILE, "w") as f:
            f.write(private_key)
        print(f"Nova clau generada i emmagatzemada a {SECRET_FILE}")
    
    return private_key, account_address

# --- Web3 Initialization ---
private_key, account_address = get_or_create_ethereum_key()

# Now display the identifier (address) after it's been determined
print(f"Adreça del compte utilitzat: {account_address}")

w3 = Web3(Web3.HTTPProvider(ETHEREUM_NODE_URL))
if not w3.is_connected():
    raise Exception(f"No s'ha pogut connectar a la xarxa a {ETHEREUM_NODE_URL}.")

account = Account.from_key(private_key) 

contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=CONTRACT_ABI)
print(f"Conectado al contrato en la dirección: {CONTRACT_ADDRESS}")

# API REST Flask
app = Flask(__name__)
CORS(app)


@app.route('/get_address', methods=['GET'])
def get_address():
    """
    API endpoint per obtindre l'adreça utilitzada.
    """
    return jsonify({"ethereum_address": account.address}), 200

@app.route('/sign_document_contract', methods=['POST'])
def sign_document_contract():
    """
    API endpoint per a signar un document.
    Espera un JSON amb els atributs 'document_hash', 'signer_address', i 'signature' en el mateix format que el contracte.
    """
    data = request.get_json()
    print("XXXX", data)
    if not data:
        return jsonify({"error": "Payload JSON buit o no vàlid"}), 400

    document_hash = data.get('document_hash')
    signer_address = data.get('signer_address')
    signature = data.get('signature')

    if not all([document_hash, signer_address, signature]):
        return jsonify({"error": "Els atributs 'document_hash', 'signer_address' i 'signature' són obligatoris"}), 400

    try:
        # Fem algunes validacions prèvies
        if not w3.is_checksum_address(signer_address):
            return jsonify({"error": f"Adreça no vàlida: {signer_address}"}), 400
        if not document_hash.startswith('0x') or len(document_hash) != 66: # 0x + 64 hex chars
            return jsonify({"error": f"Hash del document no vàlid: {document_hash}. Ha de ser un string hex de 32 bytes començant per 0x."}), 400
        if not signature.startswith('0x'):
            return jsonify({"error": f"Signatura invàlida: {signature}. Ha de ser un string hex començant per 0x."}), 400
        
        # Creem la transacció
        tx_data = contract.functions.signDocument(
            Web3.to_bytes(hexstr=document_hash),
            Web3.to_checksum_address(signer_address),
            Web3.to_bytes(hexstr=signature)
        ).build_transaction({
            'from': account.address,
            'gas': 500000,  # Set a generous gas limit for contract interactions
            'gasPrice': w3.eth.gas_price,
            'nonce': w3.eth.get_transaction_count(account.address),
        })

        # Signem la transacció
        signed_transaction = w3.eth.account.sign_transaction(tx_data, private_key)

        # Enviem la transacció
        tx_hash = w3.eth.send_raw_transaction(signed_transaction.raw_transaction)
        print(f"Transacció a signDocument enviada. Hash: {tx_hash.hex()}")

        print(f"Esperant confirmació de la transacció {tx_hash.hex()}...")
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        print(f"Transacció {tx_hash.hex()} confirmada dins del bloc {receipt.blockNumber}.")

        # Verificar si la transacción fue exitosa
        if receipt.status == 1:
            message = "Transacción confirmada correctament."
            status_code = 200
        else:
            message = "Transacción confirmada, pero amb una errada i revertida."
            status_code = 400 

        return jsonify({
            "message": message,
            "transaction_hash": tx_hash.hex(),
            "block_number": receipt.blockNumber,
            "gas_used": receipt.gasUsed,
            "transaction_status": "success" if receipt.status == 1 else "failed"
        }), status_code

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/invalidate_signature_contract', methods=['POST'])
def invalidate_signature_contract():
    """
    API endpoint per a cridar a invalidateSignature i invalidar una signatura.
    Espera de payload un JSON amb 'document_hash', 'signer_address', i 'signature'.
    """
    data = request.get_json()

    if not data:
        return jsonify({"error": "Payload JSON buit o invàlid"}), 400

    document_hash = data.get('document_hash')
    signer_address = data.get('signer_address')
    signature = data.get('signature')

    if not all([document_hash, signer_address, signature]):
        return jsonify({"error": "Els atributs 'document_hash', 'signer_address' i 'signature' són obligatoris"}), 400

    try:
        # Fem algunes validacions
        if not w3.is_checksum_address(signer_address):
            return jsonify({"error": f"Adreça no vàlida: {signer_address}"}), 400
        if not document_hash.startswith('0x') or len(document_hash) != 66: # 0x + 64 hex chars
            return jsonify({"error": f"Hash del document no vàlid: {document_hash}. Ha de ser un string hexadecimal de 32 bytes començat per 0x."}), 400
        if not signature.startswith('0x'):
            return jsonify({"error": f"Signatura no vàlida: {signature}. Ha de ser un string hexadecimal començat per 0x."}), 400

        # Construim transacció
        tx_data = contract.functions.invalidateSignature(
            Web3.to_bytes(hexstr=document_hash),
            Web3.to_checksum_address(signer_address),
            Web3.to_bytes(hexstr=signature)
        ).build_transaction({
            'from': account.address,
            'gas': 500000,  
            'gasPrice': w3.eth.gas_price,
            'nonce': w3.eth.get_transaction_count(account.address),
        })

        # Signem la transacció
        signed_transaction = w3.eth.account.sign_transaction(tx_data, private_key)

        # Enviem la transacció
        tx_hash = w3.eth.send_raw_transaction(signed_transaction.raw_transaction)
        print(f"Transacció a invalidateSignature enviada. Hash: {tx_hash.hex()}")

        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        print(f"Transacció {tx_hash.hex()} confirmada amb el bloc {receipt.blockNumber}.")

        # Verificar si la transacción fue exitosa
        if receipt.status == 1:
            message = "Transacció confirmada correctament."
            status_code = 200
        else:
            message = "Transacción confirmada, pero amb una errada i revertida."
            status_code = 400

        return jsonify({
            "message": message,
            "transaction_hash": tx_hash.hex(),
            "block_number": receipt.blockNumber,
            "gas_used": receipt.gasUsed,
            "transaction_status": "success" if receipt.status == 1 else "failed"
        }), status_code

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("Iniciant l'API REST...")
    app.run(host=HOST, port=PORT)
