package executor

import (
	"context"
	"os/exec"
	"runtime"
	"time"

	controllerpb "pc-remote-ctrl/backend/proto"
)

// CommandSet represents a stored command set with metadata
type CommandSet struct {
	Name    string   `json:"name"`
	Scripts []string `json:"scripts"`
	Desc    string   `json:"desc"`
}

// Executor handles command execution
type Executor struct{}

// New creates a new command executor
func New() *Executor {
	return &Executor{}
}

// ExecuteCommandSet executes a command set and returns the results
func (e *Executor) ExecuteCommandSet(ctx context.Context, cmdSet *CommandSet) (*controllerpb.ExecuteCommandSetResponse, error) {
	var stepResults []*controllerpb.StepResult
	allSuccess := true

	// 顺序执行命令集中的每个脚本
	for i, script := range cmdSet.Scripts {
		// 为每个步骤创建独立的上下文，支持超时控制
		stepCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		
		// Cross-platform command execution
		var execCmd *exec.Cmd
		if runtime.GOOS == "windows" {
			execCmd = exec.CommandContext(stepCtx, "cmd", "/C", script)
		} else {
			execCmd = exec.CommandContext(stepCtx, "sh", "-c", script)
		}

		output, err := execCmd.CombinedOutput()
		exitCode := int32(0)
		success := true
		
		if execCmd.ProcessState != nil {
			exitCode = int32(execCmd.ProcessState.ExitCode())
			success = exitCode == 0
		}
		
		if err != nil && success {
			// 如果有错误但退出码是0，仍然认为是失败
			success = false
		}

		stepResult := &controllerpb.StepResult{
			StepIndex:  int32(i),
			StepScript: script,
			Output:     string(output),
			Error:      safeError(err),
			ExitCode:   exitCode,
			Success:    success,
		}
		
		stepResults = append(stepResults, stepResult)
		cancel()

		// 如果某一步失败，停止执行后续步骤
		if !success {
			allSuccess = false
			break
		}
	}

	var overallError string
	if !allSuccess {
		overallError = "one or more steps failed"
	}

	return &controllerpb.ExecuteCommandSetResponse{
		StepResults: stepResults,
		Success:     allSuccess,
		Error:       overallError,
	}, nil
}

// safeError safely converts error to string, avoiding panic
func safeError(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}