from flask import Flask, request, jsonify
import MetaTrader5 as mt5
from datetime import datetime, timedelta

app = Flask(__name__)


def connect_mt5(login, password, server):
    """Kết nối và khởi tạo MT5"""
    mt5.shutdown()
    return mt5.initialize(login=login, password=password, server=server)


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

    # Lịch sử lệnh đã đóng 7 ngày gần nhất
    now = datetime.now()
    history = mt5.history_deals_get(now - timedelta(days=7), now)
    raw_history = [d._asdict() for d in history] if history else []

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

    # Lịch sử lệnh
    now = datetime.now()
    history = mt5.history_deals_get(now - timedelta(days=7), now)
    raw_history = [d._asdict() for d in history] if history else []

    mt5.shutdown()
    return jsonify({
        "status": "success",
        "account": account_data,
        "open_positions": raw_positions,
        "closed_deals": raw_history
    })


if __name__ == '__main__':
    app.run(port=5000)
