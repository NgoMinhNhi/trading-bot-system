from flask import Flask, request, jsonify
import MetaTrader5 as mt5
from datetime import datetime, timedelta
from collections import defaultdict
import datetime as dt

app = Flask(__name__)

# === CHỈ initialize 1 lần khi start server ===
MT5_PATH = "C:/Program Files/DBG Markets MetaTrader 5 - 2/terminal64.exe"
if not mt5.initialize(path=MT5_PATH):
    raise Exception(f"Không khởi động được MT5: {mt5.last_error()}")


def connect_mt5(login, password, server):
    """Đăng nhập vào tài khoản MT5"""
    if not mt5.login(login=login, password=password, server=server):
        return False
    return True


def get_complete_deals(now):
    """Lấy lịch sử deals hoàn chỉnh trong 7 ngày"""
    history = mt5.history_deals_get(now - timedelta(days=7), now)

    if not history:
        return []

    deals_by_position = defaultdict(dict)

    for deal in history:
        deal_dict = deal._asdict()
        pos_id = deal.position_id
        entry = deal.entry

        if entry == 0:  # deal mở
            deals_by_position[pos_id]['open'] = deal_dict
        elif entry == 1:  # deal đóng
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
                "createdAt": dt.datetime.utcnow().isoformat(),
                "updatedAt": dt.datetime.utcnow().isoformat(),
            })

    return complete_positions


@app.route('/mt5/orders', methods=['POST'])
def get_mt5_orders():
    """API lấy lệnh đang mở + lệnh đã đóng"""
    data = request.json
    login = data.get('login')
    password = data.get('password')
    server = data.get('server')

    if not all([login, password, server]):
        return jsonify({"error": "Thiếu thông tin đăng nhập"}), 400

    if not connect_mt5(int(login), password, server):
        return jsonify({"error": f"Đăng nhập MT5 thất bại: {mt5.last_error()}"}), 500

    positions = mt5.positions_get()
    raw_positions = [p._asdict() for p in positions] if positions else []

    now = datetime.now()
    raw_history = get_complete_deals(now)

    return jsonify({
        "status": "success",
        "open_positions": raw_positions,
        "closed_deals": raw_history
    })


@app.route('/mt5/account', methods=['POST'])
def get_mt5_account():
    """API lấy thông tin tài khoản"""
    data = request.json
    login = data.get('login')
    password = data.get('password')
    server = data.get('server')

    if not all([login, password, server]):
        return jsonify({"error": "Thiếu thông tin đăng nhập"}), 400

    if not connect_mt5(int(login), password, server):
        return jsonify({"error": f"Đăng nhập MT5 thất bại: {mt5.last_error()}"}), 500

    info = mt5.account_info()
    account_data = info._asdict() if info else {}

    return jsonify({
        "status": "success",
        "account": account_data
    })


@app.route('/mt5/all', methods=['POST'])
def get_mt5_all():
    """API lấy đầy đủ account + open positions + closed deals"""
    data = request.json
    login = data.get('login')
    password = data.get('password')
    server = data.get('server')

    if not all([login, password, server]):
        return jsonify({"error": "Thiếu thông tin đăng nhập"}), 400

    if not connect_mt5(int(login), password, server):
        return jsonify({"error": f"Đăng nhập MT5 thất bại: {mt5.last_error()}"}), 500

    info = mt5.account_info()
    account_data = info._asdict() if info else {}

    positions = mt5.positions_get()
    raw_positions = [p._asdict() for p in positions] if positions else []

    now = datetime.now()
    raw_history = get_complete_deals(now)

    return jsonify({
        "status": "success",
        "account": account_data,
        "open_positions": raw_positions,
        "closed_deals": raw_history
    })


if __name__ == '__main__':
    app.run(port=5000)
