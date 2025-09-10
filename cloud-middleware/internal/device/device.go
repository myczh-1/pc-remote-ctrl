package device

import (
	"sync"
	"time"
)

// Device 设备信息
type Device struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	UserID      string    `json:"user_id"`
	Address     string    `json:"address"`     // agent地址 (host:port)
	Status      Status    `json:"status"`
	LastSeen    time.Time `json:"last_seen"`
	RegisteredAt time.Time `json:"registered_at"`
}

// Status 设备状态
type Status string

const (
	StatusOnline  Status = "online"
	StatusOffline Status = "offline"
)

// Manager 设备管理器
type Manager struct {
	devices map[string]*Device // deviceID -> Device
	mu      sync.RWMutex
}

// NewManager 创建设备管理器
func NewManager() *Manager {
	return &Manager{
		devices: make(map[string]*Device),
	}
}

// Register 注册设备
func (m *Manager) Register(device *Device) {
	m.mu.Lock()
	defer m.mu.Unlock()
	
	device.Status = StatusOnline
	device.LastSeen = time.Now()
	device.RegisteredAt = time.Now()
	
	m.devices[device.ID] = device
}

// GetDevice 获取设备信息
func (m *Manager) GetDevice(deviceID string) (*Device, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	
	device, exists := m.devices[deviceID]
	return device, exists
}

// GetDevicesByUser 获取用户的所有设备
func (m *Manager) GetDevicesByUser(userID string) []*Device {
	m.mu.RLock()
	defer m.mu.RUnlock()
	
	var devices []*Device
	for _, device := range m.devices {
		if device.UserID == userID {
			devices = append(devices, device)
		}
	}
	
	return devices
}

// UpdateStatus 更新设备状态
func (m *Manager) UpdateStatus(deviceID string, status Status) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	
	device, exists := m.devices[deviceID]
	if !exists {
		return false
	}
	
	device.Status = status
	device.LastSeen = time.Now()
	
	return true
}

// Heartbeat 设备心跳
func (m *Manager) Heartbeat(deviceID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	
	device, exists := m.devices[deviceID]
	if !exists {
		return false
	}
	
	device.Status = StatusOnline
	device.LastSeen = time.Now()
	
	return true
}

// Remove 移除设备
func (m *Manager) Remove(deviceID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	
	delete(m.devices, deviceID)
}

// CheckOfflineDevices 检查离线设备
func (m *Manager) CheckOfflineDevices(timeout time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	
	threshold := time.Now().Add(-timeout)
	
	for _, device := range m.devices {
		if device.LastSeen.Before(threshold) {
			device.Status = StatusOffline
		}
	}
}