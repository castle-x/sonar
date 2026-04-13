package utils

import (
	"bytes"
	"compress/gzip"
	"io"
)

// Compress 使用 gzip 压缩数据
// 使用默认压缩级别（level 6）
//
// 调用场景:
// - biz/report/v1: 压缩 chunk 数据存储到 MongoDB
// - pkg/repo: 存储数据前压缩
func Compress(data []byte) ([]byte, error) {
	var buf bytes.Buffer
	gzWriter := gzip.NewWriter(&buf)

	if _, err := gzWriter.Write(data); err != nil {
		gzWriter.Close()
		return nil, err
	}

	if err := gzWriter.Close(); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

// CompressWithLevel 使用指定压缩级别压缩数据
// level: -1 (默认), 0 (不压缩), 1 (最快) 到 9 (最好压缩)
//
// 调用场景:
// - 需要平衡压缩率和速度时使用
// - 实时场景可用 level 1-3，归档场景可用 level 7-9
func CompressWithLevel(data []byte, level int) ([]byte, error) {
	var buf bytes.Buffer
	gzWriter, err := gzip.NewWriterLevel(&buf, level)
	if err != nil {
		return nil, err
	}

	if _, err := gzWriter.Write(data); err != nil {
		gzWriter.Close()
		return nil, err
	}

	if err := gzWriter.Close(); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

// Decompress 解压 gzip 数据
//
// 调用场景:
// - biz/report/v1: GetChunk 时解压 chunk 数据
// - pkg/repo: 从数据库读取数据后解压
func Decompress(compressed []byte) ([]byte, error) {
	reader := bytes.NewReader(compressed)
	gzReader, err := gzip.NewReader(reader)
	if err != nil {
		return nil, err
	}
	defer gzReader.Close()

	var buf bytes.Buffer
	if _, err := io.Copy(&buf, gzReader); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

// CompressRatio 计算压缩率（压缩后大小 / 原始大小）
// 返回值越小表示压缩效果越好
//
// 调用场景:
// - 监控和统计压缩效果
// - 记录报告统计信息
func CompressRatio(originalSize, compressedSize int64) float64 {
	if originalSize == 0 {
		return 0
	}
	return float64(compressedSize) / float64(originalSize)
}

// CompressionSavings 计算节省的空间百分比
// 返回值表示节省了多少百分比的空间
//
// 调用场景:
// - 显示压缩节省的空间
// - 统计存储优化效果
func CompressionSavings(originalSize, compressedSize int64) float64 {
	if originalSize == 0 {
		return 0
	}
	return (1 - float64(compressedSize)/float64(originalSize)) * 100
}
