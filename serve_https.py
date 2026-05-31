"""Self-signed HTTPS server for local development."""
import http.server
import ssl
import os
import datetime
import ipaddress

from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend

CERT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "server.pem")
PORT = 8443
HOST = "0.0.0.0"

def generate_cert():
    if os.path.exists(CERT_FILE):
        return

    print("Generating self-signed certificate...")
    key = rsa.generate_private_key(65537, 2048, default_backend())

    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.now(datetime.timezone.utc))
        .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=365))
        .add_extension(x509.SubjectAlternativeName([
            x509.DNSName("localhost"),
            x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
        ]), critical=False)
        .sign(key, hashes.SHA256(), default_backend())
    )

    with open(CERT_FILE, "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    print(f"Certificate saved to {CERT_FILE}")


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    generate_cert()

    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(CERT_FILE)

    handler = http.server.SimpleHTTPRequestHandler
    httpd = http.server.HTTPServer((HOST, PORT), handler)
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

    import socket
    hostname = socket.gethostname()
    local_ip = socket.gethostbyname(hostname)
    print(f"\nHTTPS server running at:")
    print(f"  https://localhost:{PORT}/")
    print(f"  https://{local_ip}:{PORT}/")
    print(f"\nOpen on phone: https://{local_ip}:{PORT}/flip-coin/")
    print("(Accept the security warning on first visit)\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == "__main__":
    main()
