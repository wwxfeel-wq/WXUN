Place SSL certificates here:
- fullchain.pem (certificate chain)
- privkey.pem (private key)

For Let's Encrypt certificates:
  certbot certonly --standalone -d your-domain.com
  cp /etc/letsencrypt/live/your-domain.com/fullchain.pem .
  cp /etc/letsencrypt/live/your-domain.com/privkey.pem .
