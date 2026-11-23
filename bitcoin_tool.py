import json
import urllib.request

BTC_API = "https://blockstream.info/api"

def bitcoin_latest_block() -> dict:
    """Return the latest Bitcoin mainnet block height and hash."""
    with urllib.request.urlopen(
        f"{BTC_API}/blocks/tip/height", timeout=15
    ) as response:
        height = int(response.read().decode().strip())

    with urllib.request.urlopen(
        f"{BTC_API}/block-height/{height}", timeout=15
    ) as response:
        block_hash = response.read().decode().strip()

    return {
        "network": "bitcoin-mainnet",
        "block_height": height,
        "block_hash": block_hash,
    }

def bitcoin_wallet_balance(address: str) -> dict:
    """Return confirmed and unconfirmed BTC balance for a public address."""
    import re

    if not re.fullmatch(r"(bc1[a-z0-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})", address):
        raise ValueError("Invalid Bitcoin mainnet address format")

    request = urllib.request.Request(
        f"{BTC_API}/address/{address}",
        headers={"User-Agent": "AI-Engineering-MCP/1.0"}
    )

    with urllib.request.urlopen(request, timeout=15) as response:
        data = json.load(response)

    confirmed = (
        data["chain_stats"]["funded_txo_sum"]
        - data["chain_stats"]["spent_txo_sum"]
    )
    unconfirmed = (
        data["mempool_stats"]["funded_txo_sum"]
        - data["mempool_stats"]["spent_txo_sum"]
    )

    return {
        "network": "bitcoin-mainnet",
        "address": address,
        "confirmed_btc": confirmed / 100_000_000,
        "unconfirmed_change_btc": unconfirmed / 100_000_000,
        "total_btc": (confirmed + unconfirmed) / 100_000_000,
    }

def bitcoin_transaction_history(address: str) -> dict:
    """Return the latest transactions for a Bitcoin address."""
    import re

    if not re.fullmatch(
        r"(bc1[a-z0-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})",
        address,
    ):
        raise ValueError("Invalid Bitcoin mainnet address format")

    request = urllib.request.Request(
        f"{BTC_API}/address/{address}/txs",
        headers={"User-Agent": "AI-Engineering-MCP/1.0"},
    )

    with urllib.request.urlopen(request, timeout=15) as response:
        transactions = json.load(response)

    return {
        "network": "bitcoin-mainnet",
        "address": address,
        "transaction_count_returned": len(transactions),
        "transactions": [
            {
                "txid": tx["txid"],
                "confirmed": tx["status"]["confirmed"],
                "block_height": tx["status"].get("block_height"),
            }
            for tx in transactions
        ],
    }
