package utils

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

// EvaluateTransform 计算转换表达式
// 支持基本的四则运算：+, -, *, /, ()
// 表达式中的 "value" 会被替换为实际数值
//
// 输入示例:
//
//	transform: "value * 100"
//	value: 0.85
//
// 输出示例: 85.0
//
// 调用场景:
// - biz/points/v1/handler.go: calculateMetricValue 中应用转换
// - pkg/utils: CalculateMetricValue 内部调用
// - biz/datasource: 指标配置中的 transform 字段处理
func EvaluateTransform(transform string, value float64) float64 {
	if transform == "" {
		return value
	}

	// 将表达式中的 "value" 替换为实际数值
	expr := strings.ReplaceAll(strings.TrimSpace(transform), "value", fmt.Sprintf("%f", value))

	// 安全检查：只允许数字、运算符、小数点、括号、空格
	safePattern := regexp.MustCompile(`^[\d\s+\-*/().]+$`)
	if !safePattern.MatchString(expr) {
		// 不安全的表达式，返回原始值
		return value
	}

	// 使用简单的表达式计算器
	result, err := evaluateExpression(expr)
	if err != nil {
		return value
	}

	// 检查结果是否有效
	if math.IsNaN(result) || math.IsInf(result, 0) {
		return value
	}

	return result
}

// FormatValue 格式化指标值，添加单位和精度控制
//
// 输入示例:
//
//	value: 123.456789
//	unit: "ms"
//	precision: 2
//
// 输出示例: "123.46ms"
//
// 调用场景:
// - biz/points/v1/handler.go: NewSummaryTable 中格式化表格单元格
// - pkg/dataprocess: 表格生成时格式化显示
// - biz/report/v1: 报告数据格式化
func FormatValue(value float64, unit string, precision int) string {
	format := fmt.Sprintf("%%.%df", precision)
	valueStr := fmt.Sprintf(format, value)

	if unit != "" {
		return valueStr + unit
	}

	return valueStr
}

// evaluateExpression 计算数学表达式
// 支持基本的四则运算：+, -, *, /, ()
// 使用递归下降解析器实现
func evaluateExpression(expr string) (float64, error) {
	// 移除所有空格
	expr = strings.ReplaceAll(expr, " ", "")
	if expr == "" {
		return 0, fmt.Errorf("empty expression")
	}

	pos := 0

	// 解析加减法（最低优先级）
	var parseAddSub func() (float64, error)
	var parseMulDiv func() (float64, error)
	var parseUnary func() (float64, error)
	var parsePrimary func() (float64, error)

	parseAddSub = func() (float64, error) {
		left, err := parseMulDiv()
		if err != nil {
			return 0, err
		}

		for pos < len(expr) && (expr[pos] == '+' || expr[pos] == '-') {
			op := expr[pos]
			pos++
			right, err := parseMulDiv()
			if err != nil {
				return 0, err
			}
			if op == '+' {
				left += right
			} else {
				left -= right
			}
		}

		return left, nil
	}

	// 解析乘除法（中等优先级）
	parseMulDiv = func() (float64, error) {
		left, err := parseUnary()
		if err != nil {
			return 0, err
		}

		for pos < len(expr) && (expr[pos] == '*' || expr[pos] == '/') {
			op := expr[pos]
			pos++
			right, err := parseUnary()
			if err != nil {
				return 0, err
			}
			if op == '*' {
				left *= right
			} else {
				if right == 0 {
					return 0, fmt.Errorf("division by zero")
				}
				left /= right
			}
		}

		return left, nil
	}

	// 解析一元运算符（负号）
	parseUnary = func() (float64, error) {
		if pos < len(expr) && (expr[pos] == '+' || expr[pos] == '-') {
			op := expr[pos]
			pos++
			value, err := parseUnary()
			if err != nil {
				return 0, err
			}
			if op == '-' {
				return -value, nil
			}
			return value, nil
		}
		return parsePrimary()
	}

	// 解析基本元素（数字或括号表达式）
	parsePrimary = func() (float64, error) {
		// 处理括号
		if pos < len(expr) && expr[pos] == '(' {
			pos++
			value, err := parseAddSub()
			if err != nil {
				return 0, err
			}
			if pos >= len(expr) || expr[pos] != ')' {
				return 0, fmt.Errorf("missing closing parenthesis")
			}
			pos++
			return value, nil
		}

		// 解析数字
		start := pos
		if pos < len(expr) && (expr[pos] == '+' || expr[pos] == '-') {
			pos++
		}
		for pos < len(expr) && (expr[pos] >= '0' && expr[pos] <= '9' || expr[pos] == '.') {
			pos++
		}

		if start == pos {
			return 0, fmt.Errorf("expected number at position %d", pos)
		}

		numStr := expr[start:pos]
		value, err := strconv.ParseFloat(numStr, 64)
		if err != nil {
			return 0, fmt.Errorf("invalid number: %s", numStr)
		}

		return value, nil
	}

	result, err := parseAddSub()
	if err != nil {
		return 0, err
	}

	if pos < len(expr) {
		return 0, fmt.Errorf("unexpected character at position %d: %c", pos, expr[pos])
	}

	return result, nil
}
