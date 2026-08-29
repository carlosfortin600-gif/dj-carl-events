#!/usr/bin/env python3
"""Upload the DJ Carl marketing site to HostPapa via SFTP or FTP."""

from __future__ import annotations

import os
import sys
from ftplib import FTP, FTP_TLS, error_perm
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / ".deploy.env"
FILES = [
    "index.html",
    "styles.css",
    "script.js",
    "i18n.js",
    "img/logo-djcarl.png",
    "img/hugues-pomerleau.png",
    "img/buzzer-chanson.png",
    "img/mic-grab.png",
    "img/theme-croisiere.jpg",
    "img/theme-country.jpg",
    "img/theme-oscar.jpg",
    "img/service-photobooth.jpg",
    "img/qr-djcarl.svg",
    "video/experience.mp4",
    *[f"img/google/{path.name}" for path in sorted((ROOT / "img" / "google").glob("*.jpg"))],
]


def load_env() -> dict[str, str]:
    if not ENV_FILE.exists():
        print(
            "Missing website/.deploy.env\n"
            "Copy website/.deploy.env.example and fill FTP_HOST, FTP_USER, FTP_PASS.",
            file=sys.stderr,
        )
        sys.exit(2)
    values: dict[str, str] = {}
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def upload_sftp(cfg: dict[str, str], remote_root: str) -> None:
    import paramiko

    host = cfg["FTP_HOST"]
    user = cfg["FTP_USER"]
    password = cfg["FTP_PASS"]
    port = int(cfg.get("SFTP_PORT", "22"))
    transport = paramiko.Transport((host, port))
    transport.connect(username=user, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    try:
        try:
            sftp.chdir(remote_root)
        except IOError:
            sftp.chdir(".")
            if "public_html" in sftp.listdir("."):
                sftp.chdir("public_html")
            else:
                raise SystemExit(f"Cannot open remote folder {remote_root}")
        cwd = sftp.getcwd() or remote_root
        for relative in FILES:
            local = ROOT / relative
            remote_parent = str(Path(relative).parent)
            if remote_parent not in (".", ""):
                try:
                    sftp.stat(remote_parent)
                except IOError:
                    sftp.mkdir(remote_parent)
            sftp.put(str(local), relative.replace("\\", "/"))
            print(f"uploaded {relative}")
        print(f"Published {len(FILES)} files via SFTP to {host}:{cwd}")
        print("Live: https://djcarl.ca")
    finally:
        sftp.close()
        transport.close()


def connect_ftp(cfg: dict[str, str]) -> FTP:
    host = cfg["FTP_HOST"]
    user = cfg["FTP_USER"]
    password = cfg["FTP_PASS"]
    port = int(cfg.get("FTP_PORT", "21"))
    last_error: Exception | None = None
    if cfg.get("FTP_SECURE", "1") != "0":
        try:
            ftp = FTP_TLS()
            ftp.connect(host, port, timeout=30)
            ftp.login(user, password)
            ftp.prot_p()
            ftp.set_pasv(True)
            return ftp
        except Exception as exc:
            last_error = exc
    try:
        ftp = FTP()
        ftp.connect(host, port, timeout=30)
        ftp.login(user, password)
        ftp.set_pasv(True)
        return ftp
    except Exception as exc:
        raise SystemExit(f"FTP login failed: {last_error or exc}") from exc


def cwd_or_mkdir(ftp: FTP, remote_dir: str) -> None:
    try:
        ftp.cwd(remote_dir)
        return
    except error_perm:
        pass
    parts = [p for p in remote_dir.replace("\\", "/").split("/") if p]
    ftp.cwd("/")
    for part in parts:
        try:
            ftp.cwd(part)
        except error_perm:
            ftp.mkd(part)
            ftp.cwd(part)


def upload_ftp(ftp: FTP, remote_root: str) -> None:
    cwd_or_mkdir(ftp, remote_root)
    ftp.cwd(remote_root if remote_root.startswith("/") else "/" + remote_root)
    root_files = [f for f in FILES if "/" not in f]
    nested = [f for f in FILES if "/" in f]
    for name in root_files:
        with (ROOT / name).open("rb") as handle:
            ftp.storbinary(f"STOR {name}", handle)
        print(f"uploaded {name}")
    dirs = sorted({str(Path(f).parent) for f in nested})
    for folder in dirs:
        dest = folder if remote_root in ("/", "") else f"{remote_root}/{folder}"
        cwd_or_mkdir(ftp, dest)
        ftp.cwd(dest if dest.startswith("/") else "/" + dest)
        for relative in nested:
            if str(Path(relative).parent) != folder:
                continue
            name = Path(relative).name
            with (ROOT / relative).open("rb") as handle:
                ftp.storbinary(f"STOR {name}", handle)
            print(f"uploaded {relative}")
        ftp.cwd(remote_root if remote_root.startswith("/") else "/" + remote_root)


def main() -> None:
    cfg = load_env()
    if not cfg.get("FTP_HOST") or not cfg.get("FTP_USER") or not cfg.get("FTP_PASS"):
        print("FTP_HOST, FTP_USER and FTP_PASS are required in website/.deploy.env", file=sys.stderr)
        sys.exit(2)
    remote_root = (cfg.get("FTP_REMOTE_DIR") or "/").strip() or "/"
    if remote_root != "/":
        remote_root = remote_root.rstrip("/")
    for relative in FILES:
        if not (ROOT / relative).exists():
            raise SystemExit(f"Missing local file: {ROOT / relative}")

    protocol = cfg.get("FTP_PROTOCOL", "sftp").lower()
    if protocol == "sftp":
        upload_sftp(cfg, remote_root)
        return

    ftp = connect_ftp(cfg)
    try:
        upload_ftp(ftp, remote_root)
        print(f"Published {len(FILES)} files to {cfg.get('FTP_HOST')}{remote_root}")
        print("Live: https://djcarl.ca")
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()


if __name__ == "__main__":
    os.chdir(ROOT)
    main()
