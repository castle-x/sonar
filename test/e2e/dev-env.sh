#!/usr/bin/env bash
# ============================================================
# dev-env.sh — 一键启动 / 停止 sonar 本地开发测试环境
#
# 启动 3 个后台进程：
#   1. sonar-store  (port 8082)
#   2. sonar-tap    (port 9090，连接到 store)
#   3. mock_gameserver (模拟目标进程 + 日志)
#
# 用法：
#   ./dev-env.sh start    # 启动所有进程
#   ./dev-env.sh stop     # 停止所有进程
#   ./dev-env.sh status   # 查看进程状态
#   ./dev-env.sh restart  # 重启所有进程
# ============================================================

set -euo pipefail

# ── 路径配置 ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

STORE_BIN="${REPO_ROOT}/sonar-store/sonar-store"
TAP_BIN="${REPO_ROOT}/sonar-tap/sonar-tap"
MOCK_BIN="${SCRIPT_DIR}/mock_gameserver"

TAP_CONFIG="${SCRIPT_DIR}/tap-config-e2e.yaml"
STORE_CONFIG="${SCRIPT_DIR}/store-config-e2e.yaml"
STORE_DATA_DIR="${SCRIPT_DIR}/data-e2e"

# 日志文件
LOG_DIR="${SCRIPT_DIR}/logs"
STORE_LOG="${LOG_DIR}/sonar-store.log"
TAP_LOG="${LOG_DIR}/sonar-tap.log"
MOCK_LOG="${LOG_DIR}/mock_gameserver.log"
MOCK_ABSLOG="/tmp/gameserver-e2e.log"

# PID 文件
PID_DIR="${SCRIPT_DIR}/.pids"
STORE_PID="${PID_DIR}/sonar-store.pid"
TAP_PID="${PID_DIR}/sonar-tap.pid"
MOCK_PID="${PID_DIR}/mock_gameserver.pid"

# ── 颜色输出 ────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
section() { echo -e "\n${BOLD}${CYAN}$*${NC}"; }

# ── 工具函数 ────────────────────────────────────────────────

is_running() {
    local pid_file="$1"
    if [[ ! -f "${pid_file}" ]]; then return 1; fi
    local pid
    pid=$(cat "${pid_file}")
    kill -0 "${pid}" 2>/dev/null
}

get_pid() {
    local pid_file="$1"
    [[ -f "${pid_file}" ]] && cat "${pid_file}" || echo "-"
}

start_process() {
    local name="$1"
    local pid_file="$2"
    local log_file="$3"
    shift 3
    local cmd=("$@")

    if is_running "${pid_file}"; then
        warn "${name} 已在运行 (PID $(get_pid "${pid_file}"))"
        return 0
    fi

    info "启动 ${name}..."
    "${cmd[@]}" >> "${log_file}" 2>&1 &
    local pid=$!
    echo "${pid}" > "${pid_file}"

    # 等待进程存活确认（最多 3s）
    local i
    for i in 1 2 3; do
        sleep 1
        if kill -0 "${pid}" 2>/dev/null; then
            ok "${name} 启动成功 (PID ${pid})"
            return 0
        fi
    done

    error "${name} 启动失败，请查看日志: ${log_file}"
    rm -f "${pid_file}"
    return 1
}

stop_process() {
    local name="$1"
    local pid_file="$2"

    if ! is_running "${pid_file}"; then
        warn "${name} 未在运行"
        rm -f "${pid_file}"
        return 0
    fi

    local pid
    pid=$(get_pid "${pid_file}")
    info "停止 ${name} (PID ${pid})..."
    kill "${pid}" 2>/dev/null || true

    # 等待进程退出（最多 5s）
    local i
    for i in $(seq 1 5); do
        sleep 1
        if ! kill -0 "${pid}" 2>/dev/null; then
            ok "${name} 已停止"
            rm -f "${pid_file}"
            return 0
        fi
    done

    warn "${name} 未响应 SIGTERM，发送 SIGKILL..."
    kill -9 "${pid}" 2>/dev/null || true
    rm -f "${pid_file}"
    ok "${name} 已强制停止"
}

# ── 构建检查 ────────────────────────────────────────────────

check_binaries() {
    local need_build=0

    if [[ ! -x "${STORE_BIN}" ]]; then
        warn "sonar-store binary 不存在，需要先构建"
        need_build=1
    fi

    if [[ ! -x "${TAP_BIN}" ]]; then
        warn "sonar-tap binary 不存在，需要先构建"
        need_build=1
    fi

    if [[ ! -x "${MOCK_BIN}" ]]; then
        warn "mock_gameserver binary 不存在，需要先构建"
        need_build=1
    fi

    if [[ "${need_build}" -eq 1 ]]; then
        section "🔨 构建 binary..."
        build_binaries
    fi
}

build_binaries() {
    if [[ ! -x "${STORE_BIN}" ]]; then
        info "构建 sonar-store..."
        (cd "${REPO_ROOT}/sonar-store" && go build -o sonar-store ./cmd/server/) \
            && ok "sonar-store 构建完成" \
            || { error "sonar-store 构建失败"; exit 1; }
    fi

    if [[ ! -x "${TAP_BIN}" ]]; then
        info "构建 sonar-tap..."
        (cd "${REPO_ROOT}/sonar-tap" && go build -o sonar-tap ./cmd/server/) \
            && ok "sonar-tap 构建完成" \
            || { error "sonar-tap 构建失败"; exit 1; }
    fi

    if [[ ! -x "${MOCK_BIN}" ]]; then
        info "构建 mock_gameserver..."
        (cd "${SCRIPT_DIR}" && go build -o mock_gameserver mock_gameserver.go) \
            && ok "mock_gameserver 构建完成" \
            || { error "mock_gameserver 构建失败"; exit 1; }
    fi
}

# ── start ────────────────────────────────────────────────────

cmd_start() {
    section "🚀 启动 Sonar 本地开发环境"

    # 创建目录
    mkdir -p "${LOG_DIR}" "${PID_DIR}" "${STORE_DATA_DIR}"

    # 检查 / 构建 binary
    check_binaries

    # 1. sonar-store（-config flag，cd 到 e2e 目录使 data-e2e 相对路径正确）
    pushd "${SCRIPT_DIR}" > /dev/null
    start_process "sonar-store" "${STORE_PID}" "${STORE_LOG}" \
        "${STORE_BIN}" -config "${STORE_CONFIG}"
    popd > /dev/null

    sleep 1  # store 先启动，再起 tap

    # 2. sonar-tap（第一个位置参数为 config 文件路径）
    start_process "sonar-tap" "${TAP_PID}" "${TAP_LOG}" \
        "${TAP_BIN}" "${TAP_CONFIG}"

    # 3. mock_gameserver
    start_process "mock_gameserver" "${MOCK_PID}" "${MOCK_LOG}" \
        "${MOCK_BIN}" \
        --id=server001 \
        "-ABSLOG=${MOCK_ABSLOG}"

    sleep 1
    cmd_status
}

# ── stop ─────────────────────────────────────────────────────

cmd_stop() {
    section "🛑 停止 Sonar 本地开发环境"
    stop_process "mock_gameserver" "${MOCK_PID}"
    stop_process "sonar-tap"       "${TAP_PID}"
    stop_process "sonar-store"     "${STORE_PID}"
    ok "所有进程已停止"
}

# ── status ───────────────────────────────────────────────────

cmd_status() {
    section "📊 进程状态"
    echo ""
    printf "  %-20s %-8s %-10s %s\n" "进程" "PID" "状态" "日志"
    printf "  %-20s %-8s %-10s %s\n" "--------------------" "--------" "----------" "----"

    for entry in \
        "sonar-store:${STORE_PID}:${STORE_LOG}:http://localhost:8082" \
        "sonar-tap:${TAP_PID}:${TAP_LOG}:http://localhost:9090" \
        "mock_gameserver:${MOCK_PID}:${MOCK_LOG}:${MOCK_ABSLOG}"
    do
        IFS=':' read -r name pid_file log_file endpoint <<< "${entry}"
        local pid
        pid=$(get_pid "${pid_file}")
        if is_running "${pid_file}"; then
            printf "  ${GREEN}%-20s${NC} %-8s ${GREEN}%-10s${NC} %s\n" \
                "${name}" "${pid}" "● 运行中" "${log_file}"
        else
            printf "  ${RED}%-20s${NC} %-8s ${RED}%-10s${NC} %s\n" \
                "${name}" "-" "○ 已停止" "${log_file}"
        fi
    done

    echo ""
    echo -e "  ${BOLD}端点信息:${NC}"
    echo -e "    sonar-store API:  ${CYAN}http://localhost:8082${NC}"
    echo -e "    sonar-tap  API:   ${CYAN}http://localhost:9090${NC}"
    echo -e "    mock_gameserver log: ${CYAN}${MOCK_ABSLOG}${NC}"
    echo ""
    echo -e "  ${BOLD}日志查看:${NC}"
    echo -e "    tail -f ${STORE_LOG}"
    echo -e "    tail -f ${TAP_LOG}"
    echo -e "    tail -f ${MOCK_LOG}"
    echo ""
}

# ── restart ──────────────────────────────────────────────────

cmd_restart() {
    cmd_stop
    sleep 1
    cmd_start
}

# ── 入口 ─────────────────────────────────────────────────────

usage() {
    echo ""
    echo -e "${BOLD}用法:${NC} $0 <command>"
    echo ""
    echo "  start    启动所有进程 (sonar-store + sonar-tap + mock_gameserver)"
    echo "  stop     停止所有进程"
    echo "  status   查看进程状态"
    echo "  restart  重启所有进程"
    echo ""
}

case "${1:-}" in
    start)   cmd_start   ;;
    stop)    cmd_stop    ;;
    status)  cmd_status  ;;
    restart) cmd_restart ;;
    *)       usage; exit 1 ;;
esac
