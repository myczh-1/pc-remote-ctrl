package executor

import (
	"context"
	"os/exec"
	"runtime"
	"time"

	controllerpb "pc-remote-ctrl/backend/proto"
)

type ShellRunner interface {
	Run(ctx context.Context, script string) *exec.Cmd
}

type shellRunner struct {
	shell string
	flag  string
}

func newShellRunner() ShellRunner {
	if runtime.GOOS == "windows" {
		return &shellRunner{shell: "cmd", flag: "/C"}
	}
	return &shellRunner{shell: "sh", flag: "-c"}
}

func (r *shellRunner) Run(ctx context.Context, script string) *exec.Cmd {
	return exec.CommandContext(ctx, r.shell, r.flag, script)
}


// Executor handles command execution
type Executor struct {
	runner ShellRunner
}

// New creates a new command executor
func New() *Executor {
	return &Executor{
		runner: newShellRunner(),
	}
}

// ExecuteCommandSet executes a command set and returns the results
func (e *Executor) ExecuteCommandSet(ctx context.Context, cmdSet *controllerpb.CommandSetInfo) (*controllerpb.ExecuteCommandSetResponse, error) {
	var stepResults []*controllerpb.StepResult
	allSuccess := true

	// 顺序执行命令集中的每个脚本
	for i, script := range cmdSet.CommandScripts {
		stepCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		
		execCmd := e.runner.Run(stepCtx, script)
		output, err := execCmd.CombinedOutput()
		
		exitCode := int32(0)
		success := true
		
		if execCmd.ProcessState != nil {
			exitCode = int32(execCmd.ProcessState.ExitCode())
			success = exitCode == 0
		}
		
		if err != nil && success {
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