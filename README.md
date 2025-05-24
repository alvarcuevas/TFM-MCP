Contingut:
 - UML: Diagrames de classes i components, i diagrames de seqüència presentats.
 - SOL: Contractes Solidity.
 - API: API en python que genera un nou compte de laboratori i permet l'enviament de les transaccions en nom del laboratori.
    - Necessita instal·lar abans paquets pythons necessaris amb l'ordre: «pip install web3 eth_account flask flask_cors»
    - S'executa amb «python3 apirest.py»
 - HTML: Proves de concepte i comunicació amb els contractes.
    - Per seguretat, no es pot utilitzar via file://
    - Amb python es pot construir un servidor http minimalista on funcionarà correctament amb l'ordre «python3 -m http.server 8000» dins del directori HTML.
