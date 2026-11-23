import json
from urllib.request import Request, urlopen

def solana_latest_slot():
    payload = json.dumps({"jsonrpc":"2.0","method":"getSlot","params":[],"id":1}).encode("utf-8")
    request = Request("https://api.mainnet-beta.solana.com", data=payload, headers={"Content-Type":"application/json"}, method="POST")
    with urlopen(request, timeout=15) as response:
        result = json.load(response)
    if "error" in result:
        raise RuntimeError(str(result["error"]))
    return {"network":"solana-mainnet","slot":result["result"]}



def solana_wallet_balance(address: str):
    import re
    if not re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{32,44}", address):
        raise ValueError("Érvénytelen Solana wallet-cím")
    payload = json.dumps({"jsonrpc":"2.0","method":"getBalance","params":[address,{"commitment":"finalized"}],"id":2}).encode("utf-8")
    request = Request("https://api.mainnet-beta.solana.com", data=payload, headers={"Content-Type":"application/json"}, method="POST")
    with urlopen(request, timeout=15) as response:
        result = json.load(response)
    if "error" in result:
        raise RuntimeError(str(result["error"]))
    lamports = result["result"]["value"]
    sol = f"{lamports // 1_000_000_000}.{lamports % 1_000_000_000:09d}"
    return {"network":"solana-mainnet","address":address,"lamports":lamports,"sol":sol}
def solana_recent_transactions(address: str) -> dict:
    """List up to five finalized transactions referencing a public Solana address."""
    import re

    if not re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{32,44}", address):
        raise ValueError("Érvénytelen Solana-cím")

    payload = json.dumps({
        "jsonrpc": "2.0",
        "id": 3,
        "method": "getSignaturesForAddress",
        "params": [address, {"commitment": "finalized", "limit": 5}],
    }).encode("utf-8")

    request = Request(
        "https://api.mainnet-beta.solana.com",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urlopen(request, timeout=15) as response:
        reply = json.load(response)

    if "error" in reply:
        raise RuntimeError(f"Solana RPC-hiba: {reply['error']}")

    return {
        "network": "solana-mainnet",
        "address": address,
        "transactions": [
            {
                "signature": item["signature"],
                "slot": item["slot"],
                "block_time_unix": item.get("blockTime"),
                "success": item["err"] is None,
                "error": item["err"],
            }
            for item in reply["result"]
        ],
    }
