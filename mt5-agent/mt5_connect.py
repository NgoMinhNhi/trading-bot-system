from flask import Flask, request, jsonify
import MetaTrader5 as mt5
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import datetime as dt
from functools import wraps

app = Flask(__name__)

# === Cấu hình MT5 ===
MT5_PATH = "C:/Program Files/DBG Markets MetaTrader 5 - 2/terminal64.exe"
if not mt5.initialize(path=MT5_PATH):
    raise Exception(f"Không khởi động được MT5: {mt5.last_error()}")

# === Theo dõi phiên đăng nhập hiện tại ===
CURRENT_LOGIN = None

# === Helpers ===
def get_mt5_credentials(data):
    try:
        return int(data.get("login")), data.get("password"), data.get("server")
    except:
        return None, None, None

def ensure_mt5_logged_in(login, password, server):
    global CURRENT_LOGIN

    info = mt5.account_info()
    if info and info.login == login:
        # Đang đăng nhập đúng user
        return True

    # Re-init nếu mất kết nối
    if not mt5.terminal_info():
        mt5.initialize(path=MT5_PATH)

    if not mt5.login(login=login, password=password, server=server):
        print("❌ Login thất bại:", mt5.last_error())
        return False

    CURRENT_LOGIN = login
    return True

def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        data = request.json or {}
        login, password, server = get_mt5_credentials(data)
        if not all([login, password, server]):
            return jsonify({"error": "Thiếu thông tin đăng nhập"}), 400
        if not ensure_mt5_logged_in(login, password, server):
            return jsonify({"error": f"Đăng nhập MT5 thất bại: {mt5.last_error()}"}), 500
        return f(*args, **kwargs)
    return wrapper

def get_complete_deals(now):
    history = mt5.history_deals_get(now - timedelta(days=3), now)
    if not history:
        return []

    deals_by_position = defaultdict(dict)
    for deal in history:
        deal_dict = deal._asdict()
        pos_id = deal.position_id
        entry = deal.entry
        if entry == 0:
            deals_by_position[pos_id]['open'] = deal_dict
        elif entry == 1:
            deals_by_position[pos_id]['close'] = deal_dict

    complete_positions = []
    for pos_id, deals in deals_by_position.items():
        open_deal = deals.get('open')
        close_deal = deals.get('close')
        if open_deal and close_deal:
            complete_positions.append({
                "position_id": pos_id,
                "symbol": open_deal['symbol'],
                "volume": open_deal['volume'],
                "open_price": open_deal['price'],
                "open_time": open_deal['time'],
                "close_price": close_deal['price'],
                "close_time": close_deal['time'],
                "profit": close_deal['profit'],
                "swap": close_deal['swap'],
                "commission": close_deal['commission'],
                "fee": close_deal['fee'],
                "ticket": close_deal['ticket'],
                "order": close_deal['order'],
                "external_id": close_deal['external_id'],
                "comment": close_deal['comment'],
                "type": close_deal['type'],
                "reason": close_deal['reason'],
                "status": "CLOSED",
                "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat()
            })

    return complete_positions

# === API Endpoints ===

@app.route('/mt5/orders', methods=['POST'])
@login_required
def get_mt5_orders():
    login, password, server = get_mt5_credentials(request.json)
    if not all([login, password, server]):
        return jsonify({"error": "Thiếu thông tin đăng nhập"}), 400
    if not ensure_mt5_logged_in(login, password, server):
        return jsonify({"error": f"Đăng nhập MT5 thất bại: {mt5.last_error()}"}), 500

    positions = mt5.positions_get()
    raw_positions = [p._asdict() for p in positions] if positions else []
    now = datetime.now() + timedelta(days=1)
    raw_history = get_complete_deals(now)

    return jsonify({
        "status": "success",
        "open_positions": raw_positions,
        "closed_deals": raw_history
    })

@app.route('/mt5/open_positions', methods=['POST'])
@login_required
def get_open_positions():
    login, password, server = get_mt5_credentials(request.json)
    if not all([login, password, server]):
        return jsonify({"error": "Thiếu thông tin đăng nhập"}), 400
    if not ensure_mt5_logged_in(login, password, server):
        return jsonify({"error": f"Đăng nhập MT5 thất bại: {mt5.last_error()}"}), 500

    positions = mt5.positions_get()
    raw_positions = [p._asdict() for p in positions] if positions else []

    return jsonify({
        "status": "success",
        "open_positions": raw_positions
    })

@app.route('/mt5/closed_deals', methods=['POST'])
@login_required
def get_closed_deals():
    login, password, server = get_mt5_credentials(request.json)
    if not all([login, password, server]):
        return jsonify({"error": "Thiếu thông tin đăng nhập"}), 400
    if not ensure_mt5_logged_in(login, password, server):
        return jsonify({"error": f"Đăng nhập MT5 thất bại: {mt5.last_error()}"}), 500

    now = datetime.now() + timedelta(days=1)
    closed = get_complete_deals(now)

    return jsonify({
        "status": "success",
        "closed_deals": closed
    })

@app.route('/mt5/account', methods=['POST'])
@login_required
def get_mt5_account():
    login, password, server = get_mt5_credentials(request.json)
    if not all([login, password, server]):
        return jsonify({"error": "Thiếu thông tin đăng nhập"}), 400
    if not ensure_mt5_logged_in(login, password, server):
        return jsonify({"error": f"Đăng nhập MT5 thất bại: {mt5.last_error()}"}), 500

    info = mt5.account_info()
    account_data = info._asdict() if info else {}

    return jsonify({
        "status": "success",
        "account": account_data
    })

@app.route('/mt5/all', methods=['POST'])
@login_required
def get_mt5_all():
    login, password, server = get_mt5_credentials(request.json)
    if not all([login, password, server]):
        return jsonify({"error": "Thiếu thông tin đăng nhập"}), 400
    if not ensure_mt5_logged_in(login, password, server):
        return jsonify({"error": f"Đăng nhập MT5 thất bại: {mt5.last_error()}"}), 500

    # Open positions
    positions = mt5.positions_get()
    raw_positions = [p._asdict() for p in positions] if positions else []

    # Closed deals
    now = datetime.now() + timedelta(days=1)
    closed = get_complete_deals(now)

    return jsonify({
        "status": "success",
        "open_positions": raw_positions,
        "closed_deals": closed
    })


@app.route('/health', methods=['GET'])
@login_required
def health_check():
    return jsonify({
        "status": "ok",
        "mt5_connection": "CONNECTED" if mt5.terminal_info() else "DISCONNECTED",
        "cached_accounts": list(MT5_ACCOUNTS.keys()),
        "cache_size": len(MT5_ACCOUNTS)
    })

if __name__ == '__main__':
    app.run(port=5000)
