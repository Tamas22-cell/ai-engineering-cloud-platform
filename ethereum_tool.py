import json
from urllib.request import Request, urlopen

def ethereum_latest_block():
    payload = json.dumps({"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}).encode("utf-8")
    request = Request("https://ethereum-rpc.publicnode.com", data=payload, headers={"Content-Type":"application/json"}, method="POST")
    with urlopen(request, timeout=15) as response:
        result = json.load(response)
    if "error" in result:
        raise RuntimeError(str(result["error"]))
    return {"network":"ethereum-mainnet","block_number":int(result["result"],16)}
