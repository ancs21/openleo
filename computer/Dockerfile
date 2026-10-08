# A board's computer: the cua Linux desktop with OpenLeo's wallpaper and a dock of Files, Terminal,
# Google Chrome and VS Code. Build with `bun run computer:build`. wallpaper.png is rendered from
# wallpaper.svg (the desktop can't draw SVG). Builds natively for arm64 and amd64.
FROM ghcr.io/trycua/linux:24.04-slim
USER root
# The desktop user is `openleo` (home /home/openleo): the image's `cua` user renamed in place, keeping
# uid 1000, which the file service allows by number. Its services name the user in supervisord.conf.
ENV CUA_DESKTOP_USER=openleo
RUN usermod -l openleo -d /home/openleo -m cua && groupmod -n openleo cua \
 && mv /etc/sudoers.d/90-cua /etc/sudoers.d/90-openleo && sed -i 's/^cua /openleo /' /etc/sudoers.d/90-openleo \
 && sed -i 's/ cua cua / openleo openleo /' /usr/lib/tmpfiles.d/cua-desktop-user.conf \
 && sed -i -e 's/^user=cua$/user=openleo/' -e 's#"/home/cua"#"/home/openleo"#g' -e 's/USER="cua"/USER="openleo"/g' -e 's/LOGNAME="cua"/LOGNAME="openleo"/g' /etc/supervisor/supervisord.conf \
 && ! grep -rqs -e '/home/cua' -e '^user=cua$' /etc/supervisor /etc/sudoers.d /usr/lib/tmpfiles.d/cua-desktop-user.conf
# The image's own architecture (arm64 on Apple silicon, amd64 elsewhere): both apps ship native .debs for each.
RUN ARCH="$(dpkg --print-architecture)" \
 && curl -fsSL -o /tmp/chrome.deb "https://dl.google.com/linux/direct/google-chrome-stable_current_${ARCH}.deb" \
 && curl -fsSL -o /tmp/code.deb "https://update.code.visualstudio.com/latest/linux-deb-$([ "$ARCH" = amd64 ] && echo x64 || echo "$ARCH")/stable" \
 && apt-get update && apt-get install -y --no-install-recommends /tmp/chrome.deb /tmp/code.deb \
 && rm -rf /tmp/*.deb /var/lib/apt/lists/* \
 && command -v google-chrome-stable >/dev/null && command -v code >/dev/null
# Chrome's own sandbox needs user namespaces the container doesn't get (the container is the
# isolation), and a small /dev/shm crashes heavy tabs. This `google-chrome` comes first on PATH, so
# the dock, XFCE's web browser helper and xdg-open all start Chrome with these flags.
RUN printf '#!/bin/sh\nexec /usr/bin/google-chrome-stable --no-sandbox --disable-dev-shm-usage "$@"\n' > /usr/local/bin/google-chrome \
 && chmod +x /usr/local/bin/google-chrome
COPY wallpaper.png /usr/share/backgrounds/openleo.png
COPY --chown=1000:1000 home/ /home/openleo/
RUN sed -i 's/^WebBrowser=.*/WebBrowser=google-chrome/' /home/openleo/.config/xfce4/helpers.rc
