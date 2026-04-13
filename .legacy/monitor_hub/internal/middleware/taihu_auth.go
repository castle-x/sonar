package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	configV1 "monitor_hub/config/v1"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/common/utils"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
	"github.com/go-jose/go-jose"
)

var developerName = "developer"

// Identity 用户身份信息
type Identity struct {
	LoginName  string  `json:"loginname"`
	StaffId    int     `json:"staffid"`
	Expiration string  `json:"expiration"`
	Ticket     *string `json:"ticket"`
}

// TaihuAuthMiddleware 太湖网关认证中间件
func TaihuAuthMiddleware(cfg *configV1.Config) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		// 由于创建报告的接口允许脚本通过API调用，内部使用，这里最高优先级放行吧，不想给脚本做认证了
		if isScriptAllowedPath(c) {
			c.Response.Header.Set("X-User-Name", "script")
			c.Response.Header.Set("X-User-Expiration", time.Now().Add(24*time.Hour).Format(time.RFC3339))
			c.Set("user_name", "script")
			c.Set("user_id", 0)
			c.Next(ctx)
			return
		}

		// 如果未启用认证，跳过
		if !cfg.Auth.Enable {
			// 开发模式：设置默认用户
			c.Response.Header.Set("X-User-Name", developerName)
			c.Response.Header.Set("X-User-Expiration", time.Now().Add(24*time.Hour).Format(time.RFC3339))
			c.Next(ctx)
			return
		}

		// 1. 提取 headers
		headers := map[string]string{
			"x-tai-identity": string(c.Request.Header.Peek("x-tai-identity")),
			"timestamp":      string(c.Request.Header.Peek("timestamp")),
			"signature":      string(c.Request.Header.Peek("signature")),
			"x-rio-seq":      string(c.Request.Header.Peek("x-rio-seq")),
			"staffid":        string(c.Request.Header.Peek("staffid")),
			"staffname":      string(c.Request.Header.Peek("staffname")),
			"x-ext-data":     string(c.Request.Header.Peek("x-ext-data")),
		}

		// 2. 验证签名
		if ok, err := checkSignature(cfg, headers); !ok {
			logger.Error("Taihu auth signature check failed: %v", err)
			// 开发模式下即使签名失败也放行，但记录日志
			if !cfg.Auth.SafeMode {
				logger.Warn("Signature check failed but continuing in non-safe mode")
			} else {
				c.JSON(consts.StatusUnauthorized, utils.H{
					"code": 401,
					"msg":  "签名验证失败",
				})
				c.Abort()
				return
			}
		}

		// 3. 获取用户身份
		identity, err := getIdentity(cfg, headers)
		if err != nil {
			logger.Error("Taihu auth get identity failed: %v", err)
			// 开发模式：即使获取失败也使用默认用户
			identity = Identity{
				LoginName:  developerName,
				StaffId:    0,
				Expiration: time.Now().Add(24 * time.Hour).Format(time.RFC3339),
			}
		}

		// 4. 将用户信息写入响应头（供前端使用）
		c.Response.Header.Set("X-User-Name", identity.LoginName)
		c.Response.Header.Set("X-User-Expiration", identity.Expiration)

		// 5. 将用户信息存入 context（供后端使用）
		c.Set("user_identity", identity)
		c.Set("user_id", identity.StaffId)
		c.Set("user_name", identity.LoginName)

		// 6. 权限检查：只有管理员才能创建/更新数据源
		if requiresAdminPermission(c) && !isAdmin(identity.LoginName) {
			logger.Warn("User %s tried to access admin-only endpoint: %s", identity.LoginName, string(c.Request.Path()))
			c.JSON(consts.StatusForbidden, utils.H{
				"code": 403,
				"msg":  "权限不足：只有管理员才能执行此操作",
			})
			c.Abort()
			return
		}

		c.Next(ctx)
	}
}

// checkSignature 校验签名
func checkSignature(cfg *configV1.Config, headers map[string]string) (bool, error) {
	var (
		timestampStr = headers["timestamp"]
		signature    = headers["signature"]
		extHeaders   = []string{headers["x-rio-seq"], "", "", ""}
	)

	// 非安全模式包含明文字段
	if !cfg.Auth.SafeMode {
		extHeaders = []string{headers["x-rio-seq"], headers["staffid"], headers["staffname"], headers["x-ext-data"]}
	}

	timestamp, err := strconv.Atoi(timestampStr)
	if err != nil {
		return false, fmt.Errorf("invalid timestamp: %s", err)
	}

	// 检查时间戳是否过期
	if time.Now().Unix()-int64(timestamp) > int64(cfg.Auth.SignatureExpire) {
		return false, errors.New("timestamp expired")
	}

	// 计算本地签名
	str := fmt.Sprintf("%s%s%s%s", timestampStr, cfg.Auth.TaihuKey, strings.Join(extHeaders, ","), timestampStr)
	localSignature := fmt.Sprintf("%x", sha256.Sum256([]byte(str)))

	if !strings.EqualFold(signature, localSignature) {
		return false, errors.New("invalid signature")
	}

	return true, nil
}

// getIdentity 获取身份信息
func getIdentity(cfg *configV1.Config, headers map[string]string) (Identity, error) {
	// 1. 尝试解密身份信息（安全模式）
	identity, err := decodeAuthorizationHeader(headers["x-tai-identity"], []byte(cfg.Auth.TaihuKey), cfg)
	if err != nil {
		// 2. 解密失败，尝试获取明文身份信息（兼容模式）
		identity, err = getPlainIdentity(headers)
	}
	return identity, err
}

// decodeAuthorizationHeader 解密函数
func decodeAuthorizationHeader(authorizationHeader string, key []byte, cfg *configV1.Config) (Identity, error) {
	var identity Identity

	if authorizationHeader == "" {
		return identity, errors.New("x-tai-identity header is empty")
	}

	// 1. 将 JWE Compact Serialization 格式的数据解析为 JWE 对象
	encrypted, err := jose.ParseEncrypted(authorizationHeader)
	if err != nil {
		return identity, fmt.Errorf("parse encrypted failed: %v", err)
	}

	// 2. 解密 payload
	decrypted, err := encrypted.Decrypt(key)
	if err != nil {
		return identity, fmt.Errorf("decrypt failed: %v", err)
	}

	// 3. 将解密后的数据转换为 payload
	if err = json.Unmarshal(decrypted, &identity); err != nil {
		return identity, fmt.Errorf("unmarshal identity failed: %v", err)
	}

	// 4. 校验 token 是否过期
	expTime, err := time.Parse(time.RFC3339, identity.Expiration)
	if err != nil {
		return identity, fmt.Errorf("parse expiration time failed: %v", err)
	}

	// 检验 token 是否已经过期，增加缓冲时间避免服务器时间差异
	bufferDuration := time.Duration(cfg.Auth.TokenExpireBuffer) * time.Minute
	if expTime.Before(time.Now().Add(-bufferDuration)) {
		return identity, errors.New("token expired")
	}

	return identity, nil
}

// getPlainIdentity 获取明文身份信息（兼容模式）
func getPlainIdentity(headers map[string]string) (Identity, error) {
	var identity Identity

	if headers["staffid"] == "" || headers["staffname"] == "" {
		return identity, errors.New("staffid or staffname is empty")
	}

	staffId, err := strconv.Atoi(headers["staffid"])
	if err != nil {
		return identity, errors.New("invalid staffid")
	}

	identity = Identity{
		LoginName:  headers["staffname"],
		StaffId:    staffId,
		Expiration: time.Now().Add(24 * time.Hour).Format(time.RFC3339), // 默认24小时过期
	}

	return identity, nil
}

// isAdmin 检查用户是否为管理员
func isAdmin(userName string) bool {
	// 管理员用户名白名单
	adminUsers := []string{"castlexu", developerName}

	for _, admin := range adminUsers {
		if userName == admin {
			return true
		}
	}

	return false
}

// requiresAdminPermission 检查当前请求是否需要管理员权限
func requiresAdminPermission(c *app.RequestContext) bool {
	path := string(c.Request.Path())

	// 需要管理员权限的接口列表
	adminOnlyPaths := []string{
		"/apis/v1/datasource/create", // 创建数据源
		"/apis/v1/datasource/update", // 更新数据源
		"/apis/v1/datasource/del",    // 删除数据源
	}

	for _, adminPath := range adminOnlyPaths {
		if path == adminPath {
			return true
		}
	}

	return false
}

// isScriptAllowedPath 检查当前请求是否是允许脚本调用的接口（无需认证）
func isScriptAllowedPath(c *app.RequestContext) bool {
	path := string(c.Request.Path())

	// 允许脚本直接调用的接口列表（内部使用，无需认证）
	scriptAllowedPaths := []string{
		"/apis/v1/report/create",          // 创建报告
		"/apis/v1/report/get",             // 获取报告详情（含评分结果）
		"/apis/v1/report/list",            // 报告列表查询
		"/apis/v1/report/update",          // 更新报告（含配置评分标准）
		"/apis/v1/report/task/get",        // 查询报告生成进度
		"/apis/v1/report/chunk/list",      // 获取报告 Table 数据
		"/apis/v1/report/score/calculate", // 计算评分
		"/apis/v1/mark/batch",             // 批量创建标记
		"/apis/v1/mark",                   // 创建标记
		"/apis/v1/mark/set_expired",       // 设置标记过期
	}

	for _, allowedPath := range scriptAllowedPaths {
		if path == allowedPath {
			return true
		}
	}

	return false
}
