from flask import Flask, request, jsonify
import MetaTrader5 as mt5
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import datetime as dt
from functools import wraps
import json
import os
from pathlib import Path
import re
from dotenv import load_dotenv


def load_environment():
    candidate_paths = [
        Path.cwd() / ".env",
        Path(__file__).resolve().parent.parent / ".env",
        Path(__file__).resolve().parent / ".env",
    ]
    for env_path in candidate_paths:
        if env_path.exists():
            load_dotenv(env_path, override=False)


load_environment()

app = Flask(__name__)


def sum_field(deals, field):
    return sum(float(deal.get(field) or 0) for deal in deals)


def weighted_average_price(deals):
    total_volume = sum_field(deals, "volume")
    if total_volume == 0:
        return deals[-1].get("price") if deals else 0
    return sum(
        float(deal.get("price") or 0) * float(deal.get("volume") or 0)
        for deal in deals
    ) / total_volume


def round_number(value, digits=2):
    return round(float(value or 0), digits)


def get_complete_deals(history):
    if not history:
        return []

    deals_by_position = defaultdict(list)
    for deal in history:
        deal_dict = deal._asdict()
        pos_id = deal.position_id
        # Bỏ qua deal nạp/rút/chuyển tiền (balance): không có symbol/position
        if not deal.symbol or pos_id == 0:
            continue
        deals_by_position[pos_id].append(deal_dict)

    complete_positions = []
    for pos_id, position_deals in deals_by_position.items():
        position_deals.sort(key=lambda item: (item.get("time") or 0, item.get("ticket") or 0))

        open_deals = [deal for deal in position_deals if deal.get("entry") == 0]
        close_deals = [
            deal for deal in position_deals if deal.get("entry") in (1, 3)
        ]

        if not open_deals or not close_deals:
            continue

        open_deal = open_deals[0]
        close_deal = close_deals[-1]
        close_volume = sum_field(close_deals, "volume")

        complete_positions.append({
            "position_id": pos_id,
            "symbol": open_deal["symbol"],
            "volume": round_number(close_volume, 8),
            "open_price": round_number(weighted_average_price(open_deals), 5),
            "open_time": min(deal["time"] for deal in open_deals),
            "close_price": round_number(weighted_average_price(close_deals), 5),
            "close_time": max(deal["time"] for deal in close_deals),
            "profit": round_number(sum_field(close_deals, "profit")),
            # Phí/swap thật nằm rải ở nhiều leg, đặc biệt close-by entry=3.
            "swap": round_number(sum_field(position_deals, "swap")),
            "commission": round_number(sum_field(position_deals, "commission")),
            "fee": round_number(sum_field(position_deals, "fee")),
            "ticket": close_deal["ticket"],
            "order": close_deal["order"],
            "external_id": close_deal.get("external_id", ""),
            "comment": close_deal.get("comment", ""),
            "type": close_deal["type"],
            "reason": close_deal["reason"],
            "status": "CLOSED",
            "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat()
        })

    return complete_positions


def is_raw_history_dump_enabled():
    value = os.getenv("MT5_RAW_HISTORY_DUMP_ENABLED", "")
    return value.lower() in ("1", "true", "yes", "on")


def sanitize_file_name(value):
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", str(value or "unknown"))


def get_raw_history_dump_dir():
    dump_dir = os.getenv("MT5_RAW_HISTORY_DUMP_DIR", "mt5-raw-history-dumps")
    path = Path(dump_dir)
    return path if path.is_absolute() else Path.cwd() / path


def get_history_days():
    try:
        days = float(os.getenv("MT5_HISTORY_DAYS", "6"))
    except ValueError:
        return 6
    return days if days > 0 else 6


def dump_raw_history_if_enabled(
    account_id,
    server,
    mt5_path,
    account_info,
    history_from,
    history_to,
    history_deals,
    history_orders,
):
    if not is_raw_history_dump_enabled():
        return

    try:
        dump_dir = get_raw_history_dump_dir()
        dump_dir.mkdir(parents=True, exist_ok=True)

        file_name = (
            f"raw-history-{sanitize_file_name(account_id)}-"
            f"{sanitize_file_name(server)}.json"
        )
        file_path = dump_dir / file_name
        tmp_path = file_path.with_suffix(file_path.suffix + ".tmp")

        raw_deals = [deal._asdict() for deal in history_deals] if history_deals else []
        raw_orders = [order._asdict() for order in history_orders] if history_orders else []

        payload = {
            "dumpedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "source": "mt5.history_deals_get + mt5.history_orders_get before get_complete_deals",
            "query": {
                "from": history_from.isoformat(),
                "to": history_to.isoformat(),
                "rangeDays": (history_to - history_from).total_seconds() / 86400,
            },
            "account": {
                "login": account_id,
                "server": server,
                "mt5Path": mt5_path,
            },
            "accountInfo": account_info._asdict() if account_info else None,
            "counts": {
                "rawDeals": len(raw_deals),
                "rawOrders": len(raw_orders),
            },
            "rawDeals": raw_deals,
            "rawOrders": raw_orders,
        }

        tmp_path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
        tmp_path.replace(file_path)
        print(f"Raw MT5 history dump saved for login {account_id}: {file_path}")
    except Exception as exc:
        print(f"Failed to dump raw MT5 history for login {account_id}: {exc}")

@app.route('/mt5/all-v2', methods=['POST'])
def get_mt5_allV2():
    data = request.json or {}
    mt5_path = str(data.get("mt5Path", "")).strip()
    account_id = data.get("login")

    if not mt5_path or not account_id:
        return jsonify({"error": "Thiếu mt5Path hoặc accountId"}), 400

    try:
        account_id = int(account_id)
    except Exception:
        return jsonify({"error": "accountId không hợp lệ"}), 400

    # === Khởi tạo MT5 instance ===
    mt5.shutdown()
    if not mt5.initialize(path=mt5_path):
        return jsonify({"error": f"Không khởi tạo được MT5 tại {mt5_path}: {mt5.last_error()}"}), 500

    # === Kiểm tra đúng tài khoản đang đăng nhập ===
    info = mt5.account_info()
    if not info:
        return jsonify({"error": "Không lấy được thông tin tài khoản. Có thể terminal chưa mở hoặc chưa đăng nhập."}), 500
    if info.login != account_id:
        return jsonify({"error": f"MT5 đang đăng nhập tài khoản khác ({info.login}), không phải {account_id}"}), 400

    # === Lấy lệnh đang mở ===
    positions = mt5.positions_get()
    raw_positions = [p._asdict() for p in positions] if positions else []

    # === Lấy lịch sử đóng lệnh ===
    now = datetime.now(timezone.utc) + timedelta(hours=24)
    history_from = now - timedelta(days=get_history_days())
    history_deals = mt5.history_deals_get(history_from, now)
    history_orders = mt5.history_orders_get(history_from, now)
    dump_raw_history_if_enabled(
        account_id=account_id,
        server=data.get("server") or info.server,
        mt5_path=mt5_path,
        account_info=info,
        history_from=history_from,
        history_to=now,
        history_deals=history_deals,
        history_orders=history_orders,
    )
    closed = get_complete_deals(history_deals)

    return jsonify({
        "status": "success",
        "account": info._asdict(),
        "open_positions": raw_positions,
        "closed_deals": closed
    })


@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "ok",
        "mt5_connection": "CONNECTED" if mt5.terminal_info() else "DISCONNECTED",
        "cached_accounts": list(MT5_ACCOUNTS.keys()),
        "cache_size": len(MT5_ACCOUNTS)
    })

if __name__ == '__main__':
    import logging
    logging.getLogger('werkzeug').setLevel(logging.ERROR)
    app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False)
