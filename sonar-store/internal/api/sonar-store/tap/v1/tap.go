package tapv1

type TapState int32

const (
	TapState_UP      TapState = 1
	TapState_DOWN    TapState = 2
	TapState_UNKNOWN TapState = 3
)

type Tap struct {
	ID             string            `json:"id"`
	AppID          string            `json:"app_id"`
	Instance       string            `json:"instance"`
	Labels         map[string]string `json:"labels,omitempty"`
	State          TapState          `json:"state"`
	LastScrape     int64             `json:"last_scrape"`
	FirstScrape    int64             `json:"first_scrape"`
	ScrapeCount    int64             `json:"scrape_count"`
	LastError      *string           `json:"last_error,omitempty"`
	ScrapeInterval *int64            `json:"scrape_interval,omitempty"`
}

func (t *Tap) GetID() string                    { return t.ID }
func (t *Tap) GetAppID() string                 { return t.AppID }
func (t *Tap) GetInstance() string              { return t.Instance }
func (t *Tap) GetLabels() map[string]string     { return t.Labels }
func (t *Tap) GetState() TapState               { return t.State }
func (t *Tap) GetLastScrape() int64             { return t.LastScrape }
func (t *Tap) GetFirstScrape() int64            { return t.FirstScrape }
func (t *Tap) GetScrapeCount() int64            { return t.ScrapeCount }
func (t *Tap) GetLastError() *string            { return t.LastError }

type TapStats struct {
	Total        int64 `json:"total"`
	UpCount      int64 `json:"up_count"`
	DownCount    int64 `json:"down_count"`
	UnknownCount int64 `json:"unknown_count"`
}

func (s *TapStats) GetTotal() int64        { return s.Total }
func (s *TapStats) GetUpCount() int64      { return s.UpCount }
func (s *TapStats) GetDownCount() int64    { return s.DownCount }
func (s *TapStats) GetUnknownCount() int64 { return s.UnknownCount }

type ListTapsRequest struct {
	AppID    string    `json:"app_id,omitempty" form:"app_id"`
	State    *TapState `json:"state,omitempty" form:"state"`
	Page     int64     `json:"page,omitempty" form:"page"`
	PageSize int64     `json:"page_size,omitempty" form:"page_size"`
}

func (r *ListTapsRequest) GetAppID() string { return r.AppID }
func (r *ListTapsRequest) GetState() TapState {
	if r.State != nil {
		return *r.State
	}
	return 0
}
func (r *ListTapsRequest) GetPage() int64         { return r.Page }
func (r *ListTapsRequest) GetPageSize() int64     { return r.PageSize }
func (r *ListTapsRequest) IsSetState() bool       { return r.State != nil }

type GetTapRequest struct {
	ID string `json:"id" path:"id"`
}

func (r *GetTapRequest) GetID() string { return r.ID }

type GetTapStatsRequest struct {
	AppID string `json:"app_id,omitempty" form:"app_id"`
}

func (r *GetTapStatsRequest) GetAppID() string { return r.AppID }

type ListTapsResponse struct {
	Taps     []*Tap `json:"taps"`
	Total    int64  `json:"total"`
	Page     *int64 `json:"page,omitempty"`
	PageSize *int64 `json:"page_size,omitempty"`
}

type GetTapResponse struct {
	Tap *Tap `json:"tap,omitempty"`
}

type GetTapStatsResponse struct {
	Stats *TapStats `json:"stats"`
}
