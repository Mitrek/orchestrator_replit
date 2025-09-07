
{ pkgs }: {
  deps = [
    pkgs.nodejs-20_x
    pkgs.git

    # Chromium + runtime libs for Puppeteer
    pkgs.chromium
    pkgs.nss
    pkgs.atk
    pkgs.at-spi2-atk
    pkgs.cups
    pkgs.libdrm
    pkgs.alsa-lib
    pkgs.libxshmfence
    pkgs.mesa
    pkgs.libxkbcommon
    pkgs.glib
    pkgs.pango
    pkgs.cairo
    pkgs.freetype
    pkgs.fontconfig
    pkgs.harfbuzz
  ];
}
