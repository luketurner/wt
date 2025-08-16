FROM node:20

ARG TZ
ENV TZ="$TZ"

# Install basic development tools and iptables/ipset
RUN apt update && apt install -y less \
  git \
  procps \
  sudo \
  fzf \
  zsh \
  man-db \
  unzip \
  gnupg2 \
  gh \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  jq \
  sqlite3 \
  tree \
  tmux \
  vim \
  asciinema \
  locales \
  visidata \
  zip

# Fix weird locale error? From https://stackoverflow.com/a/55077451
RUN echo "LC_ALL=en_US.UTF-8" >> /etc/environment
RUN echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen
RUN echo "LANG=en_US.UTF-8" > /etc/locale.conf
RUN sudo locale-gen en_US.UTF-8

# Ensure default node user has access to /usr/local/share
RUN mkdir -p /usr/local/share/npm-global && \
  chown -R node:node /usr/local/share

ARG USERNAME=node

# Persist bash history.
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R $USERNAME /commandhistory

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true

# Create workspace and config directories and set permissions
RUN mkdir -p /workspace /home/node/.claude && \
  chown -R node:node /workspace /home/node/.claude

WORKDIR /workspace

RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/dandavison/delta/releases/download/0.18.2/git-delta_0.18.2_${ARCH}.deb" && \
  sudo dpkg -i "git-delta_0.18.2_${ARCH}.deb" && \
  rm "git-delta_0.18.2_${ARCH}.deb"

# install helix (for worktree workflows)
RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/helix-editor/helix/releases/download/25.01.1/helix_25.1.1-1_${ARCH}.deb" && \
  sudo dpkg -i "helix_25.1.1-1_${ARCH}.deb" && \
  rm "helix_25.1.1-1_${ARCH}.deb"

ENV EDITOR=hx

# install lazygit (for worktree workflows)
RUN LAZYGIT_VERSION=$(curl -s "https://api.github.com/repos/jesseduffield/lazygit/releases/latest" | \grep -Po '"tag_name": *"v\K[^"]*') && \
  curl -Lo lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/download/v${LAZYGIT_VERSION}/lazygit_${LAZYGIT_VERSION}_Linux_x86_64.tar.gz" && \
  tar xf lazygit.tar.gz lazygit && \
  sudo install lazygit -D -t /usr/local/bin/ && \
  rm lazygit.tar.gz

# install difftastic (for worktree workflows)
RUN curl -Lo difftastic.tar.gz "https://github.com/Wilfred/difftastic/releases/download/0.64.0/difft-x86_64-unknown-linux-gnu.tar.gz" && \
  tar xf difftastic.tar.gz difft && \
  sudo install difft -D -t /usr/local/bin/ && \
  rm difftastic.tar.gz

# install zellij (for worktree workflows)
RUN curl -Lo zellij.tar.gz "https://github.com/zellij-org/zellij/releases/download/v0.42.2/zellij-x86_64-unknown-linux-musl.tar.gz" && \
  tar xf zellij.tar.gz zellij && \
  sudo install zellij -D -t /usr/local/bin/ && \
  rm zellij.tar.gz

# Set up non-root user
USER node

# Install global packages
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Set the default shell to zsh rather than sh
ENV SHELL=/bin/zsh

# Default powerline10k theme
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v1.2.0/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  -a "alias wt=\"bun run worktree\"" \
  -a "alias bc=\"backlog task create\"" \
  -a "alias bv=\"backlog board view\"" \
  -x

# tmux settings
RUN echo "setw -g mouse on\nbind q killw" > /home/node/.tmux.conf

# zellij settings
RUN mkdir -p /home/node/.config/zellij
RUN zellij setup --dump-config > /home/node/.config/zellij/config.kdl
RUN echo "default_mode \"locked\"\n" >> /home/node/.config/zellij/config.kdl
RUN sed -i 's/Ctrl g/Ctrl b/g' /home/node/.config/zellij/config.kdl
RUN sed -i 's/Ctrl q/q/g' /home/node/.config/zellij/config.kdl

# lazygit settings
RUN mkdir -p /home/node/.config/lazygit/
RUN echo "{ git: { paging: { externalDiffCommand: \"difft --color=always\" } } }" > /home/node/.config/lazygit/config.yml

# install language server for helix
RUN npm install -g typescript typescript-language-server

# Install Claude
RUN npm install -g @anthropic-ai/claude-code

# Install Bun
RUN npm install -g bun

# install Backlog.md (https://github.com/MrLesk/Backlog.md)
RUN npm install -g backlog.md

# Copy and set up firewall script
COPY init-firewall.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/init-firewall.sh && \
  echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
  chmod 0440 /etc/sudoers.d/node-firewall
USER node