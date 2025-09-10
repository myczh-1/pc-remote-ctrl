package cache

import (
	"sync"
	"time"
)

// Cache 统一缓存接口
type Cache interface {
	Set(key string, value interface{}, ttl time.Duration) error
	Get(key string) (interface{}, error)
	Delete(key string) error
	Exists(key string) bool
	Clear() error
}

// cacheItem 缓存项
type cacheItem struct {
	value      interface{}
	expiration int64
}

// MemoryCache 内存缓存实现
type MemoryCache struct {
	data map[string]cacheItem
	mu   sync.RWMutex
}

// NewMemoryCache 创建内存缓存
func NewMemoryCache() *MemoryCache {
	cache := &MemoryCache{
		data: make(map[string]cacheItem),
	}
	
	// 启动清理过期数据的协程
	go cache.cleanup()
	
	return cache
}

// Set 设置缓存
func (c *MemoryCache) Set(key string, value interface{}, ttl time.Duration) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	
	expiration := int64(0)
	if ttl > 0 {
		expiration = time.Now().Add(ttl).UnixNano()
	}
	
	c.data[key] = cacheItem{
		value:      value,
		expiration: expiration,
	}
	
	return nil
}

// Get 获取缓存
func (c *MemoryCache) Get(key string) (interface{}, error) {
    c.mu.RLock()
    defer c.mu.RUnlock()
    
    item, exists := c.data[key]
    if !exists {
        return nil, nil
    }
    
    // 检查是否过期
    if item.expiration > 0 && time.Now().UnixNano() > item.expiration {
        // 为避免在读锁下写入，引入的删除操作交由定时清理协程处理
        // 这里直接视为未命中
        return nil, nil
    }
    
    return item.value, nil
}

// Delete 删除缓存
func (c *MemoryCache) Delete(key string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	
	delete(c.data, key)
	return nil
}

// Exists 检查缓存是否存在
func (c *MemoryCache) Exists(key string) bool {
    c.mu.RLock()
    defer c.mu.RUnlock()
    
    item, exists := c.data[key]
    if !exists {
        return false
    }
    
    // 检查是否过期
    if item.expiration > 0 && time.Now().UnixNano() > item.expiration {
        // 避免在读锁下写入，删除交由清理协程
        return false
    }
    
    return true
}

// Clear 清空缓存
func (c *MemoryCache) Clear() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	
	c.data = make(map[string]cacheItem)
	return nil
}

// cleanup 定期清理过期数据
func (c *MemoryCache) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	
	for range ticker.C {
		c.mu.Lock()
		now := time.Now().UnixNano()
		
		for key, item := range c.data {
			if item.expiration > 0 && now > item.expiration {
				delete(c.data, key)
			}
		}
		
		c.mu.Unlock()
	}
}

// NewCache 缓存工厂函数
func NewCache(cacheType string) Cache {
	switch cacheType {
	case "memory":
		return NewMemoryCache()
	// case "redis":
	//     return NewRedisCache()
	default:
		return NewMemoryCache()
	}
}
