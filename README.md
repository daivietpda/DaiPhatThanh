# Web Controller cho Armbian

Dự án này là một web controller Node.js/Express dùng để điều khiển phát thanh qua MQTT. Với cấu hình Docker Compose mới, bạn có thể chạy cùng lúc:

- Web controller tại cổng 3000
- MQTT broker Mosquitto tại cổng 1883

## Yêu cầu

Trên Armbian, hãy cài trước:

- Docker Engine
- Docker Compose plugin
- Git

### Cài Docker trên Armbian

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

## Chạy bằng Docker Compose trên Armbian

### 1) Clone source

```bash
git clone <repo-url>
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
http://<IP_ARMBIAN>:3000/login
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
  "topicPrefix": "daivietpda"
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

