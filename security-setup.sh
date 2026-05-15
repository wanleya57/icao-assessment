#!/bin/bash
set -euo pipefail

echo "=============================="
echo " Linux + Nginx 安全加固脚本 "
echo "=============================="

# ============================================================
# 你需要先改这里
# ============================================================
SSH_USER="<YOUR_SSH_USER>"
SSH_PUBKEY='<YOUR_SSH_PUBLIC_KEY>'

# ============================================================
# 基础检查
# ============================================================
if [[ -z "${SSH_USER}" || "${SSH_USER}" == "youradmin" ]]; then
  echo "ERROR: 请先把 SSH_USER 改成你的真实用户名"
  exit 1
fi

if [[ -z "${SSH_PUBKEY}" || "${SSH_PUBKEY}" == *"xxxxxxxx"* ]]; then
  echo "ERROR: 请先把 SSH_PUBKEY 改成你的真实公钥"
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: 请使用 root 执行"
  exit 1
fi

# ============================================================
# 安装软件
# ============================================================
apt update
apt install -y nginx fail2ban unattended-upgrades apt-listchanges curl sudo

# ============================================================
# 创建安全目录
# ============================================================
mkdir -p /etc/nginx/snippets
mkdir -p /etc/ssh/sshd_config.d

# ============================================================
# 创建/确认 SSH 用户
# ============================================================
if ! id "$SSH_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$SSH_USER"
fi

usermod -aG sudo "$SSH_USER" || true

# ============================================================
# 先配置 SSH 密钥
# ============================================================
install -d -m 700 -o "$SSH_USER" -g "$SSH_USER" "/home/$SSH_USER/.ssh"
cat > "/home/$SSH_USER/.ssh/authorized_keys" <<EOF
$SSH_PUBKEY
EOF
chown "$SSH_USER:$SSH_USER" "/home/$SSH_USER/.ssh/authorized_keys"
chmod 600 "/home/$SSH_USER/.ssh/authorized_keys"

# ============================================================
# Cloudflare Real IP
# ============================================================
cat > /etc/nginx/snippets/cloudflare-realip.conf << 'EOF'
real_ip_header CF-Connecting-IP;
real_ip_recursive on;

set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;

set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;
EOF

# ============================================================
# Nginx 限流
# ============================================================
cat > /etc/nginx/conf.d/00-rate-limit.conf << 'EOF'
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=5r/s;
limit_req_zone $binary_remote_addr zone=login_limit:10m rate=1r/s;
limit_req_zone $binary_remote_addr zone=ai_limit:10m rate=2r/s;
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
EOF

# ============================================================
# 安全头
# ============================================================
cat > /etc/nginx/snippets/security.conf << 'EOF'
server_tokens off;

add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; frame-ancestors 'self'; object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; upgrade-insecure-requests" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

client_max_body_size 5m;
client_body_timeout 10s;
client_header_timeout 10s;
keepalive_timeout 30s;
send_timeout 10s;
EOF

# ============================================================
# Nginx 主配置
# ============================================================
cat > /etc/nginx/sites-available/default << 'EOF'
server {
          listen 80 default_server;
    server_name _;

    include /etc/nginx/snippets/cloudflare-realip.conf;
    include /etc/nginx/snippets/security.conf;

    location /api/auth/ {
        limit_req zone=login_limit burst=3 nodelay;
        limit_conn conn_limit 5;

        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
    }

    location /v1/ {
        limit_req zone=ai_limit burst=5 nodelay;
        limit_conn conn_limit 10;

        proxy_pass http://127.0.0.1:3000;
        proxy_read_timeout 300s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
    }

    location /api/ {
        limit_req zone=api_limit burst=10 nodelay;
        limit_conn conn_limit 20;

        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
    }

    location / {
        return 403;
    }
}
EOF

# ============================================================
# fail2ban
# ============================================================
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3
backend = auto
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 86400

[nginx-limit-req]
enabled = true
port = http,https
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 5
bantime = 7200

[nginx-botsearch]
enabled = true
port = http,https
filter = nginx-botsearch
logpath = /var/log/nginx/access.log
maxretry = 2
bantime = 86400
EOF

# ============================================================
# SSH 加固：先测试，再生效
# ============================================================
cat > /etc/ssh/sshd_config.d/99-hardening.conf << EOF
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowTcpForwarding no
AllowAgentForwarding no
AllowUsers $SSH_USER
EOF

chmod 600 /etc/ssh/sshd_config.d/99-hardening.conf

# ============================================================
# 其他系统设置
# ============================================================
dpkg-reconfigure -plow unattended-upgrades || true

systemctl disable avahi-daemon 2>/dev/null || true
systemctl disable cups 2>/dev/null || true

cat > /etc/motd << 'EOF'
==========================================
警告：未经授权的访问是禁止的
所有操作都被记录和监控
==========================================
EOF

# ============================================================
# 配置测试
# ============================================================
echo "检查 Nginx 配置..."
nginx -t

echo "检查 SSH 配置..."
sshd -t

# ============================================================
# 重启服务
# ============================================================
systemctl enable nginx
systemctl restart nginx

systemctl enable fail2ban
systemctl restart fail2ban

if systemctl list-unit-files | grep -q '^ssh\.service'; then
  systemctl restart ssh
elif systemctl list-unit-files | grep -q '^sshd\.service'; then
  systemctl restart sshd
else
  service ssh restart 2>/dev/null || service sshd restart
fi

echo
echo "=============================="
echo " 安全加固完成 "
echo "=============================="
echo "SSH 用户: $SSH_USER"
echo "请先用这个用户测试能否正常 SSH 登录，再退出旧会话。"
