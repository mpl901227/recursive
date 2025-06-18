#!/usr/bin/env python3
"""
로그 시스템 서버 테스트 스크립트
"""

import asyncio
import aiohttp
import json
import time
from server import LogCollectorServer

async def test_server():
    """서버 테스트"""
    print("🧪 로그 시스템 서버 테스트 시작...")
    
    # 서버 시작
    server = LogCollectorServer(host="localhost", port=8888)
    
    # 서버를 백그라운드에서 시작
    server_task = asyncio.create_task(server.start())
    
    # 서버가 시작될 때까지 잠시 대기
    await asyncio.sleep(2)
    
    try:
        # JSON-RPC 테스트
        async with aiohttp.ClientSession() as session:
            # 1. Health check
            print("1️⃣ Health check 테스트...")
            async with session.get('http://localhost:8888/health') as resp:
                health_result = await resp.text()
                print(f"   ✅ Health: {health_result}")
            
            # 2. Log 전송 테스트
            print("2️⃣ Log 전송 테스트...")
            log_payload = {
                "jsonrpc": "2.0",
                "method": "log",
                "params": {
                    "source": "test_script",
                    "level": "INFO",
                    "message": "Hello World Test Message",
                    "metadata": {"test": True}
                },
                "id": 1
            }
            
            async with session.post(
                'http://localhost:8888/rpc',
                json=log_payload,
                headers={'Content-Type': 'application/json'}
            ) as resp:
                log_result = await resp.json()
                print(f"   ✅ Log 전송: {log_result}")
            
            # 3. Query 테스트
            print("3️⃣ Query 테스트...")
            query_payload = {
                "jsonrpc": "2.0",
                "method": "query",
                "params": {
                    "sources": ["test_script"],
                    "limit": 5
                },
                "id": 2
            }
            
            async with session.post(
                'http://localhost:8888/rpc',
                json=query_payload,
                headers={'Content-Type': 'application/json'}
            ) as resp:
                query_result = await resp.json()
                print(f"   ✅ Query 결과: {len(query_result.get('result', {}).get('logs', []))}개 로그 조회")
            
            # 4. Stats 테스트
            print("4️⃣ Stats 테스트...")
            stats_payload = {
                "jsonrpc": "2.0",
                "method": "get_stats",
                "params": {},
                "id": 3
            }
            
            async with session.post(
                'http://localhost:8888/rpc',
                json=stats_payload,
                headers={'Content-Type': 'application/json'}
            ) as resp:
                stats_result = await resp.json()
                print(f"   ✅ Stats: {stats_result.get('result', {}).get('total_logs', 0)}개 총 로그")
        
        print("🎉 모든 테스트 완료!")
        
    except Exception as e:
        print(f"❌ 테스트 실패: {e}")
    
    finally:
        # 서버 종료
        server_task.cancel()
        try:
            await server_task
        except asyncio.CancelledError:
            pass

if __name__ == "__main__":
    asyncio.run(test_server()) 