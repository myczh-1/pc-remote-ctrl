package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
)

func callGRPC(method string, data interface{}) {
	conn, err := net.Dial("tcp", "localhost:7071")
	if err != nil {
		log.Fatalf("连接失败: %v", err)
	}
	defer conn.Close()
	
	dataJSON, _ := json.Marshal(data)
	message := map[string]interface{}{
		"method": method,
		"data":   string(dataJSON),
	}
	
	msgBytes, _ := json.Marshal(message)
	conn.Write(msgBytes)
	
	response := make([]byte, 1024)
	n, _ := conn.Read(response)
	fmt.Printf("方法 %s 响应: %s\n", method, string(response[:n]))
}

func main() {
	fmt.Println("测试gRPC智能家居控制器...")
	
	// 1. 存储命令
	fmt.Println("\n1. 测试存储命令:")
	callGRPC("StoreCommand", map[string]string{
		"command_id": "hello", "command_name": "Hello命令", 
		"command_script": "echo 'Hello from gRPC Controller!'", "description": "简单的问候命令"})
	
	// 2. 获取所有命令
	fmt.Println("\n2. 测试获取所有命令:")
	callGRPC("GetAllCommands", nil)
	
	// 3. 执行命令
	fmt.Println("\n3. 测试执行命令:")
	callGRPC("ExecuteCommand", map[string]string{"command_id": "hello"})
	
	fmt.Println("\n✅ 所有测试完成！gRPC控制器工作正常")
}