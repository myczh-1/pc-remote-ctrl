import { useState } from 'react'
import './App.css'

import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport'
import { ControllerServiceClient } from './proto/controller.client'
import type {
    StoreCommandRequest,
    GetAllCommandsRequest,
    ExecuteCommandRequest,
} from './proto/controller'

// 走 Vite 代理：/api -> http://localhost:7072（并去掉 /api）
const transport = new GrpcWebFetchTransport({ baseUrl: '/api' })
const client = new ControllerServiceClient(transport)

export default function App() {
    const [log, setLog] = useState('')
    const [loading, setLoading] = useState(false)
    const [commands, setCommands] = useState<
        Array<{ commandId: string; commandName: string; commandScript: string; description?: string }>
    >([])

    const appendLog = (s: string) => setLog((p) => p + s + '\n')

    const storeSample = async () => {
        setLoading(true)
        try {
            const req: StoreCommandRequest = {
                commandId: 'demo',
                commandName: 'echo-demo',
                commandScript: 'echo hello-from-protobuf-ts',
                description: 'stored from web',
            }
            const { response } = await client.storeCommand(req)
            appendLog(`StoreCommand: success=${response.success} msg=${response.message}`)
        } catch (e: any) {
            appendLog(`StoreCommand ERROR: ${e?.message || String(e)}`)
        } finally {
            setLoading(false)
        }
    }

    const listAll = async () => {
        setLoading(true)
        try {
            const req = {} as GetAllCommandsRequest
            const { response } = await client.getAllCommands(req)
            const list = (response.commands ?? []).map(c => ({
                commandId: c.commandId, commandName: c.commandName,
                commandScript: c.commandScript, description: c.description
            }))
            setCommands(list)
            appendLog(`GetAllCommands: ${list.length} items`)
        } catch (e: any) {
            appendLog(`GetAllCommands ERROR: ${e?.message || String(e)}`)
        } finally {
            setLoading(false)
        }
    }

    const runCommand = async (id: string) => {
        setLoading(true)
        try {
            const req: ExecuteCommandRequest = { commandId: id }
            const { response } = await client.executeCommand(req)
            appendLog(
                `ExecuteCommand(${id}): success=${response.success} code=${response.exitCode} output="${(response.output ?? '').trim()}" error="${response.error ?? ''}"`
            )
        } catch (e: any) {
            appendLog(`ExecuteCommand ERROR: ${e?.message || String(e)}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <h1>grpc-web (protobuf-ts) quick test</h1>

            <div className="card" style={{ display: 'grid', gap: 8 }}>
                <button disabled={loading} onClick={storeSample}>① Store sample "echo"</button>
                <button disabled={loading} onClick={listAll}>② List all commands</button>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
                <h3>Commands</h3>
                {commands.length === 0 ? (
                    <p>no data</p>
                ) : (
                    <ul>
                        {commands.map((c, i) => (
                            <li key={i} style={{ marginBottom: 8 }}>
                                <code>id={c.commandId} name={c.commandName} script={c.commandScript}</code>
                                <div>
                                    <button disabled={loading} onClick={() => runCommand(c.commandId)}>Run</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="card" style={{ marginTop: 12 }}>
                <h3>Log</h3>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{log}</pre>
            </div>
        </>
    )
}