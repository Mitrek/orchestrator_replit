
{ pkgs }: {
  deps = [
    pkgs.nodejs_20
    pkgs.nodePackages.npm
    pkgs.nodePackages.typescript
    pkgs.nodePackages.tsx
    # Essential chromium dependencies only
    pkgs.chromium
    pkgs.nss
    pkgs.nspr
    pkgs.glib
    pkgs.pango
    pkgs.cairo
    pkgs.gtk3
    pkgs.gdk-pixbuf
    pkgs.fontconfig
    pkgs.freetype
    pkgs.harfbuzz
    pkgs.at-spi2-core
    pkgs.atk
    pkgs.cups
    pkgs.expat
    pkgs.alsaLib
    pkgs.libuuid
    pkgs.libdrm
    pkgs.mesa
    # Basic X11 libs
    pkgs.xorg.libX11
    pkgs.xorg.libXcomposite
    pkgs.xorg.libXdamage
    pkgs.xorg.libXext
    pkgs.xorg.libXrandr
    pkgs.xorg.libXrender
    pkgs.xorg.libXfixes
    pkgs.xorg.libXScrnSaver
    pkgs.xorg.libxcb
  ];
  env = {
    LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
      pkgs.nss
      pkgs.nspr
      pkgs.glib
      pkgs.pango
      pkgs.cairo
      pkgs.gtk3
      pkgs.gdk-pixbuf
      pkgs.fontconfig
      pkgs.freetype
      pkgs.harfbuzz
      pkgs.at-spi2-core
      pkgs.atk
      pkgs.cups
      pkgs.expat
      pkgs.alsaLib
      pkgs.libuuid
      pkgs.libdrm
      pkgs.mesa
      pkgs.xorg.libX11
      pkgs.xorg.libXcomposite
      pkgs.xorg.libXdamage
      pkgs.xorg.libXext
      pkgs.xorg.libXrandr
      pkgs.xorg.libXrender
      pkgs.xorg.libXfixes
      pkgs.xorg.libXScrnSaver
      pkgs.xorg.libxcb
    ];
  };
}
