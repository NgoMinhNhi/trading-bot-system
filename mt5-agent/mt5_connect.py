from flask import Flask, request, jsonify
import MetaTrader5 as mt5
from datetime import datetime, timedelta
from collections import defaultdict
import datetime as dt

app = Flask(__name__)


def connect_mt5(login, password, server):
    """Kết nối và khởi tạo MT5"""
    mt5.shutdown()
    return mt5.initialize(login=login, password=password, server=server)


def get_complete_deals(now):
    """Lấy và xử lý lịch sử deals thành các lệnh hoàn chỉnh"""
    history = mt5.history_deals_get(now - timedelta(days=7), now)

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
                "createdAt": dt.datetime.utcnow().isoformat(),
                "updatedAt": dt.datetime.utcnow().isoformat(),
            })

    return complete_positions


@app.route('/mt5/orders', methods=['POST'])
def get_mt5_orders():
    data = request.json
    login = int(data.get('login'))
    password = data.get('password')
    server = data.get('server')

    if not all([login, password, server]):
        return jsonify({"error": "Thiếu thông tin đăng nhập"}), 400

    if not connect_mt5(login, password, server):
        return jsonify({"error": f"Kết nối MT5 thất bại: {mt5.last_error()}"}), 500

    # Lấy lệnh đang mở
    positions = mt5.positions_get()
    raw_positions = [p._asdict() for p in positions] if positions else []

    # Lịch sử lệnh đã đóng
    now = datetime.now()
    raw_history = get_complete_deals(now)

    mt5.shutdown()
    return jsonify({
        "status": "success",
        "open_positions": raw_positions,
        "closed_deals": raw_history
    })


@app.route('/mt5/account', methods=['POST'])
def get_mt5_account():
    data = request.json
    login = int(data.get('login'))
    password = data.get('password')
    server = data.get('server')

    if not all([login, password, server]):
        return jsonify({"error": "Thiếu thông tin đăng nhập"}), 400

    if not connect_mt5(login, password, server):
        return jsonify({"error": f"Kết nối MT5 thất bại: {mt5.last_error()}"}), 500

    info = mt5.account_info()
    account_data = info._asdict() if info else {}

    mt5.shutdown()
    return jsonify({
        "status": "success",
        "account": account_data
    })


@app.route('/mt5/all', methods=['POST'])
def get_mt5_all():
    data = request.json
    login = int(data.get('login'))
    password = data.get('password')
    server = data.get('server')

    if not all([login, password, server]):
        return jsonify({"error": "Thiếu thông tin đăng nhập"}), 400

    if not connect_mt5(login, password, server):
        return jsonify({"error": f"Kết nối MT5 thất bại: {mt5.last_error()}"}), 500

    # Tài khoản
    info = mt5.account_info()
    account_data = info._asdict() if info else {}

    # Lệnh đang mở
    positions = mt5.positions_get()
    raw_positions = [p._asdict() for p in positions] if positions else []

    # Lịch sử lệnh đã đóng
    now = datetime.now()
    raw_history = get_complete_deals(now)

    mt5.shutdown()
    return jsonify({
        "status": "success",
        "account": account_data,
        "open_positions": raw_positions,
        "closed_deals": raw_history
    })


if __name__ == '__main__':
    app.run(port=5000)
