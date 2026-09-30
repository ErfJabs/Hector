#!/bin/bash

### Basic setup
USERNAME="ErfJabs"
SCRIPT_NAME="hector"
# Branch the script installs/updates itself from. Override for testing: HECTOR_BRANCH=dev
DEFAULT_BRANCH="${HECTOR_BRANCH:-master}"
INSTALL_BASE_DIR="/opt/erfjab/${SCRIPT_NAME}"
REPO_URL="https://github.com/${USERNAME}/${SCRIPT_NAME}.git"

### Color variables
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

### Logging functions
log() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

### Check and install required dependencies
check_dependency() {
    local pkg="$1"
    local bin="${2:-$1}"
    if ! command -v "$bin" &> /dev/null; then
        log "Installing $pkg..."
        apt-get install -y "$pkg" 2>/dev/null || error "$pkg is required but could not be installed"
        success "$pkg installed"
    fi
}

# Update package list once
log "Updating package list..."
apt-get update -qq 2>/dev/null || warn "Could not update package list, continuing anyway"

# Core utilities
check_dependency curl
check_dependency jq
check_dependency git
check_dependency nano
check_dependency openssl

success "All dependencies are ready"

### Instance installation functions

check_instance_name() {
    local instance_name="$1"
    if [[ -z "$instance_name" ]]; then
        error "Instance name is required"
    fi
    if [[ ! -d "$INSTALL_BASE_DIR/$instance_name" ]]; then
        error "Instance '$instance_name' does not exist"
    fi
}

check_branch_name() {
    local branch_name="$1"
    log "Checking release for branch '$branch_name'"
    if [[ -z "$branch_name" ]]; then
        error "Branch name is required"
    fi
    local tag="${branch_name}-latest"
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        "https://api.github.com/repos/${USERNAME}/${SCRIPT_NAME}/releases/tags/${tag}")
    if [[ "$http_code" != "200" ]]; then
        error "No release found for branch '$branch_name' (tag: ${tag})"
    fi
    success "Release for branch '$branch_name' verified (tag: ${tag})"
}

check_not_exists() {
    local instance_name="$1"
    if [[ -z "$instance_name" ]]; then
        error "Instance name is required"
    fi
    if [[ -d "$INSTALL_BASE_DIR/$instance_name" ]]; then
        error "Instance '$instance_name' already exists"
    fi
}

subscription_show_env() {
    # open instance env file in nano editor
    local instance_name="$1"
    local instance_dir="$INSTALL_BASE_DIR/$instance_name"
    local env_file="$instance_dir/.env"
    if [[ ! -f "$env_file" ]]; then
        error "Environment file '$env_file' does not exist"
    fi
    nano "$env_file"
}

subscription_create_env() {
    # download .env.example and create .env with a random JWT secret
    local instance_name="$1"
    local branch_name="$2"
    local instance_dir="$INSTALL_BASE_DIR/$instance_name"
    local env_file="$instance_dir/.env"
    if [[ -f "$env_file" ]]; then
        error "Environment file '$env_file' already exists. It will be replaced."
    fi
    local raw_url="https://raw.githubusercontent.com/${USERNAME}/${SCRIPT_NAME}/${branch_name}/.env.example"
    log "Downloading .env.example from branch '$branch_name'"
    curl -sSf \
        "$raw_url" \
        -o "$env_file" || error "Failed to download .env.example from branch '$branch_name'"

    # Set API to listen on all interfaces
    sed -i "s|^API_HOST=.*|API_HOST=0.0.0.0|" "$env_file" 2>/dev/null || echo "API_HOST=0.0.0.0" >> "$env_file"

    # Generate random JWT secret key
    local jwt_secret
    jwt_secret=$(openssl rand -hex 32)
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${jwt_secret}|" "$env_file" 2>/dev/null || echo "JWT_SECRET=${jwt_secret}" >> "$env_file"

    success "Environment file '$env_file' created"
}

subscription_install() {
    log "Starting instance installation '$1' branch '$2'..."
    ask_confirmation "instance installation"
    check_not_exists "$1"
    local instance_name="$1"
    local branch_name="$2"
    check_branch_name "$branch_name"
    # create directory
    directory_create "$instance_name"
    # download pre-built binary
    binary_download "$instance_name" "$branch_name"
    # setup env with a random jwt secret
    subscription_create_env "$instance_name" "$branch_name"
    subscription_show_env "$instance_name"
    # create and start service
    service_create "$instance_name"
    service_start "$instance_name"
    success "Instance '$instance_name' installation completed"
}
subscription_update() {
    log "Starting instance update '$1' branch '$2'..."
    # ask sure confirmation
    ask_confirmation "instance update"
    # check instance name
    check_instance_name "$1"
    # check branch name
    local branch_name="$2"
    check_branch_name "$branch_name"
    # stop service
    service_stop "$1"
    # update binary for the new branch
    binary_update "$1" "$branch_name"
    # start service
    service_start "$1"
}
subscription_remove() {
    log "Starting instance removal '$1'..."
    ask_confirmation "instance removal"
    check_instance_name "$1"
    # stop service
    service_stop "$1"
    # remove service
    service_remove "$1"
    # remove directory
    directory_remove "$1"

}
subscription_status() {
    # check service status
    local instance_name="$1"
    check_instance_name "$instance_name"
    service_status "$instance_name"
}
subscription_start() {
    # start service
    local instance_name="$1"
    check_instance_name "$instance_name"
    service_start "$instance_name"
}
subscription_stop() {
    # stop service
    local instance_name="$1"
    check_instance_name "$instance_name"
    service_stop "$instance_name"
}
subscription_logs() {
    # show service logs
    local instance_name="$1"
    check_instance_name "$instance_name"
    local line_count="${2:-20}"
    if ! [[ "$line_count" =~ ^[0-9]+$ ]]; then
        error "Line count must be a valid number"
        return 1
    fi
    local log_file="$INSTALL_BASE_DIR/$instance_name/$instance_name.log"
    if [[ ! -f "$log_file" ]]; then
        error "Log file '$log_file' does not exist"
    fi
    log "Showing logs for instance '$instance_name' (Press Ctrl+C to exit)"
    tail -n "$line_count" -f "$log_file" || error "Failed to read log file"
}


### List all installed instances with their status
subscription_list() {
    if [[ ! -d "$INSTALL_BASE_DIR" ]]; then
        warn "No installations found in '$INSTALL_BASE_DIR'"
        return
    fi

    local instances=()
    while IFS= read -r -d $'\0' dir; do
        instances+=("$(basename "$dir")")
    done < <(find "$INSTALL_BASE_DIR" -mindepth 1 -maxdepth 1 -type d -print0)

    if [[ ${#instances[@]} -eq 0 ]]; then
        warn "No instances found in '$INSTALL_BASE_DIR'"
        return
    fi

    echo ""
    echo -e "${BLUE}═══ Installed instances ═══${NC}"
    for instance in "${instances[@]}"; do
        local status_icon status_text
        if systemctl is-active --quiet "${SCRIPT_NAME}_$instance" 2>/dev/null; then
            status_icon="${GREEN}●${NC}"
            status_text="running"
        else
            status_icon="${RED}○${NC}"
            status_text="stopped"
        fi
        local instance_dir="$INSTALL_BASE_DIR/$instance"
        local created_at
        created_at=$(stat -c '%Y' "$instance_dir" 2>/dev/null)
        if [[ -n "$created_at" ]]; then
            created_at=$(date -d "@$created_at" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date '+%Y-%m-%d %H:%M:%S' -d "@$created_at" 2>/dev/null || echo "unknown")
        else
            created_at="unknown"
        fi
        printf "  %b %-22s %-12s %s\n" "$status_icon" "$instance" "$status_text" "$created_at"
    done
    echo -e "${BLUE}────────────────────────────${NC}"
    echo -e "Total: ${GREEN}${#instances[@]}${NC} instance(s)"
    echo ""
}

### Print the directory path for an instance (useful for: cd \$(hector dir <name>))
subscription_dir() {
    local instance_name="$1"
    check_instance_name "$instance_name"
    echo "$INSTALL_BASE_DIR/$instance_name"
}

subscription_update_all() {
    log "Starting update for all instances..."
    # ask sure confirmation
    ask_confirmation "updating all instances"
    if [[ ! -d "$INSTALL_BASE_DIR" ]]; then
        error "Installation base directory '$INSTALL_BASE_DIR' does not exist"
        return 1
    fi

    local branch_name="$1"
    if [[ -z "$branch_name" ]]; then
        error "Branch name is required for updating all instances"
    fi
    check_branch_name "$branch_name"

    local instances=()
    while IFS= read -r -d $'\0' dir; do
        instances+=("$(basename "$dir")")
    done < <(find "$INSTALL_BASE_DIR" -mindepth 1 -maxdepth 1 -type d -print0)

    if [[ ${#instances[@]} -eq 0 ]]; then
        warn "No instances found in '$INSTALL_BASE_DIR'"
        return
    fi

    for instance in "${instances[@]}"; do
        log "Updating instance '$instance'"
        if systemctl is-active --quiet "${SCRIPT_NAME}_$instance"; then
            service_stop "$instance"
            binary_update "$instance" "$branch_name"
            service_start "$instance"
            success "Instance '$instance' updated"
        else
            warn "Instance '$instance' is not running. Skipping update."
        fi
    done
    success "All instances updated"
}

### Service management functions
service_create() {
    # create systemd service file
    local instance_name="$1"
    local instance_dir="$INSTALL_BASE_DIR/$instance_name"
    local service_file="/etc/systemd/system/${SCRIPT_NAME}_$instance_name.service"
    if [[ -f "$service_file" ]]; then
        error "Service file '$service_file' already exists. It will be replaced."
    fi
    log "Creating systemd service file '$service_file'"
    cat > "$service_file" <<EOF
[Unit]
Description=$SCRIPT_NAME Service (Instance: $instance_name)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$instance_dir
ExecStart=$instance_dir/$SCRIPT_NAME
Restart=always
RestartSec=3
TimeoutStopSec=3
KillMode=control-group
KillSignal=SIGKILL
StandardOutput=append:$instance_dir/$instance_name.log
StandardError=append:$instance_dir/$instance_name.log

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload || error "Failed to reload systemd daemon"
    systemctl enable "${SCRIPT_NAME}_$instance_name" || error "Failed to enable service"
    success "Systemd service file '$service_file' created and enabled"
}

service_start() {
    # start service
    local instance_name="$1"
    if [[ ! -f "/etc/systemd/system/${SCRIPT_NAME}_$instance_name.service" ]]; then
        error "Service '${SCRIPT_NAME}_$instance_name' does not exist"
    fi
    log "Starting service '${SCRIPT_NAME}_$instance_name'"
    systemctl start "${SCRIPT_NAME}_$instance_name" || error "Failed to start service"
    success "Service '${SCRIPT_NAME}_$instance_name' started"
}

service_stop() {
    # stop service
    local instance_name="$1"
    if [[ ! -f "/etc/systemd/system/${SCRIPT_NAME}_$instance_name.service" ]]; then
        error "Service '${SCRIPT_NAME}_$instance_name' does not exist"
    fi
    log "Stopping service '${SCRIPT_NAME}_$instance_name'"
    systemctl stop "${SCRIPT_NAME}_$instance_name" || error "Failed to stop service"
    success "Service '${SCRIPT_NAME}_$instance_name' stopped"
}

service_status() {
    # check service status
    local instance_name="$1"
    local full_service_name="${SCRIPT_NAME}_$instance_name"
    if [[ ! -f "/etc/systemd/system/${full_service_name}.service" ]]; then
        error "Service '${full_service_name}' does not exist"
    fi
    local status
    status=$(systemctl is-active "$full_service_name" 2>/dev/null)
    if [[ "$status" == "active" ]]; then
        success "Service '${full_service_name}' is running"
    else
        warn "Service '${full_service_name}' is not running"
    fi
}

service_remove() {
    # remove service
    local instance_name="$1"
    local service_file="/etc/systemd/system/${SCRIPT_NAME}_$instance_name.service"
    if [[ ! -f "$service_file" ]]; then
        warn "Service file '$service_file' does not exist"
        return
    fi
    log "Stopping and disabling service '${SCRIPT_NAME}_$instance_name'"
    systemctl stop "${SCRIPT_NAME}_$instance_name" || warn "Failed to stop service"
    systemctl disable "${SCRIPT_NAME}_$instance_name" || warn "Failed to disable service"
    rm -f "$service_file" || error "Failed to remove service file"
    systemctl daemon-reload || error "Failed to reload systemd daemon"
    success "Service '${SCRIPT_NAME}_$instance_name' removed"
}

### script management functions
script_install() {
    local script_path="/usr/local/bin/$SCRIPT_NAME"
    local script_url="https://raw.githubusercontent.com/$USERNAME/$SCRIPT_NAME/${DEFAULT_BRANCH}/install.sh"

    ### check if script exists
    if [[ -f "$script_path" ]]; then
        warn "$SCRIPT_NAME script already exists. It will be replaced."
        log "Removing existing script..."
        rm -f "$script_path"
        success "Existing script removed"
    fi

    ### Download the script (-f: fail on HTTP errors instead of installing "404: Not Found")
    log "Installing $SCRIPT_NAME script..."
    if ! curl -fsSL -o "$script_path" "$script_url"; then
        rm -f "$script_path"
        error "Failed to download the script from '$script_url'"
    fi

    ### Verify the downloaded script starts with a shebang
    if ! head -n1 "$script_path" | grep -q '^#!'; then
        rm -f "$script_path"
        error "Downloaded script is invalid"
    fi

    ### Set execute permissions
    chmod +x "$script_path" || error "Failed to set execute permissions"

    ### Verify installation
    if [[ -x "$script_path" ]]; then
        success "$SCRIPT_NAME script successfully installed in $script_path"
        echo "You can now run it with: $SCRIPT_NAME"
    else
        error "Installation verification failed"
    fi
}
script_remove() {
    local script_path="/usr/local/bin/$SCRIPT_NAME"

    ### Check if script exists
    if [[ -f "$script_path" ]]; then
        log "Removing $SCRIPT_NAME script..."
        rm -f "$script_path" || error "Failed to remove the script"
        success "$SCRIPT_NAME script removed from $script_path"
    else
        warn "$SCRIPT_NAME script not found at $script_path"
    fi
}

### Print what actually landed: the short hash makes a stale download (raw CDN
### cache or wrong branch) visible at update time.
binary_report() {
    local path="$1"
    [ -s "$path" ] || return 0
    log "Installed $(basename "$path"): $(sha256sum "$path" | cut -c1-16) ($(stat -c%s "$path") bytes)"
}

### binary functions
detect_arch() {
    local arch
    arch=$(uname -m)
    case "$arch" in
        x86_64)  echo "amd64" ;;
        aarch64) echo "arm64" ;;
        armv7l)  echo "armv7" ;;
        armv6l)  echo "armv6" ;;
        *) error "Unsupported architecture: $arch" ;;
    esac
}

binary_download() {
    local instance_name="$1"
    local branch_name="$2"
    local instance_dir="$INSTALL_BASE_DIR/$instance_name"
    local arch
    arch=$(detect_arch)
    local tag="${branch_name}-latest"
    local binary_name="${SCRIPT_NAME}-linux-${arch}"
    log "Fetching release info for tag '$tag' (arch: $arch)"
    local release_json
    release_json=$(curl -sSf \
        "https://api.github.com/repos/${USERNAME}/${SCRIPT_NAME}/releases/tags/${tag}") \
        || error "Failed to fetch release '$tag'"
    local asset_url
    asset_url=$(echo "$release_json" | jq -r \
        ".assets[] | select(.name == \"${binary_name}\") | .url")
    if [[ -z "$asset_url" || "$asset_url" == "null" ]]; then
        error "Binary '$binary_name' not found in release '$tag'"
    fi
    log "Downloading binary '$binary_name'"
    curl -sSfL \
        -H "Accept: application/octet-stream" \
        "$asset_url" \
        -o "$instance_dir/$SCRIPT_NAME" || error "Failed to download binary"
    chmod +x "$instance_dir/$SCRIPT_NAME" || error "Failed to set execute permissions"
    binary_report "$instance_dir/$SCRIPT_NAME"
    success "Binary '$binary_name' installed"
}

binary_update() {
    local instance_name="$1"
    local branch_name="$2"
    local instance_dir="$INSTALL_BASE_DIR/$instance_name"
    log "Updating binary for instance '$instance_name' (branch: $branch_name)"
    rm -f "$instance_dir/$SCRIPT_NAME" || warn "Could not remove old binary"
    binary_download "$instance_name" "$branch_name"
    success "Binary updated for instance '$instance_name'"
}

### directory functions
directory_create() {
    local instance_name="$1"
    local instance_dir="$INSTALL_BASE_DIR/$instance_name"
    log "Checking directory '$instance_dir'"
    if [[ -d "$instance_dir" ]]; then
        error "Directory '$instance_dir' already exists"
    fi
    log "Creating directory '$instance_dir'"
    mkdir -p "$instance_dir" || error "Failed to create directory '$instance_dir'"
    success "Directory '$instance_dir' created"
}
directory_remove() {
    local instance_name="$1"
    local instance_dir="$INSTALL_BASE_DIR/$instance_name"
    log "Checking directory '$instance_dir'"
    if [[ ! -d "$instance_dir" ]]; then
        warn "Directory '$instance_dir' does not exist"
        return
    fi
    log "Removing directory '$instance_dir'"
    rm -rf "$instance_dir" || error "Failed to remove directory '$instance_dir'"
    success "Directory '$instance_dir' removed"
}


### extra functions
ask_confirmation() {
    operation_description="$1"
    read -p "Are you sure you want to proceed with $operation_description? [y/N] " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        warn "Operation '$operation_description' cancelled"
        exit 0
    fi
}

case "$1" in
    install)
        subscription_install "$2" "$3"
        subscription_logs "$2"
        ;;
    update)
        subscription_update "$2" "$3"
        subscription_logs "$2"
        ;;
    remove)
        subscription_remove "$2"
        ;;
    status)
        subscription_status "$2"
        ;;
    start)
        subscription_start "$2"
        subscription_logs "$2"
        ;;
    stop)
        subscription_stop "$2"
        ;;
    restart)
        subscription_stop "$2"
        subscription_start "$2"
        subscription_logs "$2"
        ;;
    logs)
        subscription_logs "$2" "$3"
        ;;
    env)
        subscription_show_env "$2"
        echo ""
        read -p "Do you want to restart this instance to apply changes? [y/N] " restart_confirm
        if [[ "$restart_confirm" =~ ^[Yy]$ ]]; then
            log "Restarting instance '$2'..."
            service_stop "$2"
            service_start "$2"
            success "Instance '$2' restarted"
            subscription_logs "$2"
        fi
        ;;
    list)
        subscription_list
        ;;
    dir)
        subscription_dir "$2"
        ;;
    update-all)
        subscription_update_all "$2"
        ;;
    script-install)
        script_install
        ;;
    script-update)
        script_install
        ;;
    script-remove)
        script_remove
        ;;
    help)
        ### Display help message
        echo "Script Management for $SCRIPT_NAME"
        echo
        echo "Commands:"
        echo "  install            Install a new instance"
        echo "  update             Update an existing instance"
        echo "  remove             Remove an existing instance"
        echo "  status             Check the status of an instance"
        echo "  start              Start an instance"
        echo "  stop               Stop an instance"
        echo "  restart            Restart an instance"
        echo "  logs               View logs of an instance"
        echo "  env                Edit the .env file, then optionally restart"
        echo "  list               List all instances with status"
        echo "  dir                Print instance directory path (cd \$(hector dir <name>))"
        echo
        echo "  update-all         Update all instances to a branch"
        echo "  script-install     Install or update the $SCRIPT_NAME script"
        echo "  script-update      Install or update the $SCRIPT_NAME script"
        echo "  script-remove      Remove the $SCRIPT_NAME script"
        echo "  help               Show this help message"
        echo
        echo "Telegram: https://t.me/erfjabs"
        ;;
    *)
        error "Invalid command. Use '$SCRIPT_NAME help' for full usage instructions."
        ;;
esac
