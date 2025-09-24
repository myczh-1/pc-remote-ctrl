package registry

import (
    "errors"
    "sync"
    "time"

    cloudpb "pc-remote-ctrl/cloud-middleware/proto/cloud"
)

// TunnelLink represents a live reverse-tunnel connection for one device.
// It provides multiplexing by corr_id and safe Send into the underlying stream.
type TunnelLink struct {
    sendMu sync.Mutex
    sender func(*cloudpb.TunnelFrame) error

    mu      sync.Mutex
    waiters map[string]chan *cloudpb.TunnelFrame
    closed  bool
    bufSize int
}

func NewTunnelLink(bufSize int, sender func(*cloudpb.TunnelFrame) error) *TunnelLink {
    return &TunnelLink{
        sender:  sender,
        waiters: make(map[string]chan *cloudpb.TunnelFrame),
        bufSize: bufSize,
    }
}

// Send a frame to agent via underlying stream (serialized).
func (l *TunnelLink) Send(f *cloudpb.TunnelFrame) error {
    l.mu.Lock()
    closed := l.closed
    l.mu.Unlock()
    if closed {
        return errors.New("tunnel closed")
    }
    l.sendMu.Lock()
    defer l.sendMu.Unlock()
    return l.sender(f)
}

// Register creates (or returns existing) channel for a corr_id.
// The returned cancel func unregisters the waiter.
func (l *TunnelLink) Register(corrID string) (<-chan *cloudpb.TunnelFrame, func()) {
    l.mu.Lock()
    defer l.mu.Unlock()
    if l.closed {
        ch := make(chan *cloudpb.TunnelFrame)
        close(ch)
        return ch, func() {}
    }
    ch, ok := l.waiters[corrID]
    if !ok {
        size := l.bufSize
        if size <= 0 { size = 64 }
        ch = make(chan *cloudpb.TunnelFrame, size)
        l.waiters[corrID] = ch
    }
    cancel := func() {
        l.mu.Lock()
        if c, ok := l.waiters[corrID]; ok {
            delete(l.waiters, corrID)
            close(c)
        }
        l.mu.Unlock()
    }
    return ch, cancel
}

// Deliver pushes a frame into the waiter channel by corr_id.
func (l *TunnelLink) Deliver(f *cloudpb.TunnelFrame) {
    corrID := f.GetCorrId()
    l.mu.Lock()
    ch, ok := l.waiters[corrID]
    l.mu.Unlock()
    if ok {
        // try immediate send, else wait briefly to avoid silent drop for unary
        select {
        case ch <- f:
        default:
            timer := time.NewTimer(200 * time.Millisecond)
            select {
            case ch <- f:
                timer.Stop()
            case <-timer.C:
                // backpressure overflow: close waiter to signal error upstack
                l.mu.Lock()
                if c, ok := l.waiters[corrID]; ok {
                    delete(l.waiters, corrID)
                    close(c)
                }
                l.mu.Unlock()
            }
        }
        // Close waiter on terminal frames
        if f.GetType() == cloudpb.FrameType_CLOSE || f.GetType() == cloudpb.FrameType_ERROR {
            l.mu.Lock()
            if c, ok := l.waiters[corrID]; ok {
                delete(l.waiters, corrID)
                close(c)
            }
            l.mu.Unlock()
        }
    }
}

// Close marks the link closed and closes all waiter channels.
func (l *TunnelLink) Close() {
    l.mu.Lock()
    if l.closed {
        l.mu.Unlock()
        return
    }
    l.closed = true
    for id, ch := range l.waiters {
        delete(l.waiters, id)
        close(ch)
    }
    l.mu.Unlock()
}
