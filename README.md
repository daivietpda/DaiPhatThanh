# Web Controller cho Linux

Dự án này là một web controller Node.js/Express dùng để điều khiển phát thanh qua MQTT. Với cấu hình Docker Compose mới, bạn có thể chạy cùng lúc:

- Web controller tại cổng 3000
- MQTT broker Mosquitto tại cổng 1883

## Hình ảnh chụp màn hình

- [Ảnh 1](image/Screenshot_20260707_182117_Chrome.jpg)
- [Ảnh 2](image/Screenshot_20260707_182121_Chrome.jpg)
- [Ảnh 3](image/Screenshot_20260707_182145_Chrome.jpg)
- [Ảnh 4](image/Screenshot_20260707_182218_Chrome.jpg)
- [Ảnh 5](image/Screenshot_20260707_182640_Chrome.jpg)

## Tính năng chính

- Điều khiển phát nhạc hoặc tắt phát thanh tới một hoặc nhiều thiết bị qua MQTT.
- Quản lý danh sách thiết bị, kênh phát nhanh và lịch hẹn giờ phát tự động.
- Hỗ trợ đăng ký tài khoản quản trị lần đầu tại trang đăng nhập.
- Hỗ trợ đổi tên đăng nhập và mật khẩu quản trị sau khi đã đăng nhập.

## Đăng nhập và quản trị

1. Mở trình duyệt và truy cập: http://<IP_LINUX>:3000/login
2. Nếu đây là lần đầu chạy, sử dụng khối “Đăng ký tài khoản quản trị” để tạo tài khoản quản trị đầu tiên.
3. Sau khi đăng nhập, vào tab “Cài đặt” và sử dụng khối “Tài khoản quản trị” để:
   - nhập mật khẩu hiện tại,
   - đổi tên đăng nhập,
   - đổi mật khẩu mới,
   - nhập lại mật khẩu mới để xác nhận.

Thông tin tài khoản quản trị được lưu vào file [admin-account.json](admin-account.json).

## Yêu cầu

Trên Linux, hãy cài trước:

- Docker Engine
- Docker Compose plugin
- Git

### Cài Docker trên Linux

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER
```

Sau đó đăng xuất và đăng nhập lại.

## Chạy bằng Docker Compose trên Linux

### 1) Clone source

```bash
git clone https://github.com/daivietpda/DaiPhatThanh.git
cd DaiPhatThanh
```

### 2) Build và chạy toàn bộ stack

```bash
docker compose up -d --build
```

### 3) Xem log

```bash
docker compose logs -f web-controller mqtt-broker
```

### 4) Truy cập web

Mở trình duyệt:

```text
http://<IP_LINUX>:3000/login
```

### 5) Dừng dịch vụ

```bash
docker compose down
```

### 6) Xóa dữ liệu MQTT nếu cần

```bash
docker compose down -v
```

## Cấu hình MQTT

Web controller sẽ kết nối tới broker MQTT nội bộ theo cấu hình mặc định trong [mqtt-config.json](mqtt-config.json):

```json
{
  "host": "mqtt-broker",
  "port": 1883,
  "protocol": "mqtt",
  "username": "",
  "password": "",
  "topicPrefix": "home/audio"
}
```

Nếu bạn muốn dùng broker khác, hãy sửa file [mqtt-config.json](mqtt-config.json) thành địa chỉ IP hoặc hostname phù hợp.

## Tự động chạy khi bật điện

Docker Compose sẽ tự khởi động lại các container khi máy reboot vì đã cấu hình `restart: unless-stopped`.

## Chạy bằng PM2 (tùy chọn)

Nếu bạn không dùng Docker, có thể chạy trực tiếp bằng PM2:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
cd /path/to/DaiPhatThanh
npm install
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Kiểm tra nhanh

Sau khi khởi động, bạn có thể chạy kiểm thử đơn giản:

```bash
npm test
```

Nếu mọi thứ hoạt động đúng, bạn sẽ thấy một test xác thực tài khoản quản trị đã pass.

## Troubleshooting

### Port 3000 đang bị chiếm

```bash
sudo lsof -i :3000
```

### Port 1883 đang bị chiếm

```bash
sudo lsof -i :1883
```

### Xem log container

```bash
docker compose logs -f web-controller mqtt-broker
```

### Khởi động lại container

```bash
docker compose restart
```

