package basev1

import "encoding/json"

type BaseErrorCode int64

const (
	BaseErrorCode_SUCCESS     BaseErrorCode = 0
	BaseErrorCode_NOT_FOUND   BaseErrorCode = 404
	BaseErrorCode_BAD_REQUEST BaseErrorCode = 400
	BaseErrorCode_INTERNAL    BaseErrorCode = 500
)

type Response struct {
	Code    int64           `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

type Option func(*Response)

func WithData(data interface{}) Option {
	return func(r *Response) {
		b, _ := json.Marshal(data)
		r.Data = b
	}
}

func Success(opts ...Option) *Response {
	r := &Response{Code: 0, Message: "success"}
	for _, o := range opts {
		o(r)
	}
	return r
}

func Failed(err error, code int64) *Response {
	msg := "failed"
	if err != nil {
		msg = err.Error()
	}
	return &Response{Code: code, Message: msg}
}
