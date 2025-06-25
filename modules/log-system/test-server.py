#!/usr/bin/env python3
"""
간단한 CORS 테스트 서버 - LogSystem UI 통합 테스트용
"""

from aiohttp import web
import aiohttp_cors
import json
import asyncio
from datetime import datetime

async def handle_health(request):
    """헬스체크 엔드포인트"""
    return web.json_response({
        'status': 'ok', 
        'timestamp': datetime.now().isoformat(),
        'server': 'Test Log System'
    })

async def handle_rpc(request):
    """JSON-RPC 2.0 테스트 엔드포인트"""
    try:
        data = await request.json()
        print(f"[RPC] 요청 수신: {data}")
        
        method = data.get('method')
        request_id = data.get('id')
        
        # 테스트 응답
        if method == 'ping':
            result = {
                'pong': True,
                'timestamp': datetime.now().isoformat(),
                'server': 'Test Log System'
            }
        elif method == 'query':
            result = {
                'logs': [
                    {
                        'id': '1',
                        'timestamp': datetime.now().isoformat(),
                        'level': 'INFO',
                        'source': 'test',
                        'message': 'Test log entry',
                        'metadata': {}
                    }
                ],
                'count': 1
            }
        else:
            return web.json_response({
                'jsonrpc': '2.0',
                'error': {'code': -32601, 'message': 'Method not found'},
                'id': request_id
            })
        
        return web.json_response({
            'jsonrpc': '2.0',
            'result': result,
            'id': request_id
        })
        
    except Exception as e:
        print(f"[RPC] 에러: {e}")
        return web.json_response({
            'jsonrpc': '2.0',
            'error': {'code': -32603, 'message': 'Internal error'},
            'id': data.get('id') if 'data' in locals() else None
        })

async def create_app():
    """애플리케이션 생성"""
    app = web.Application()
    
    # CORS 설정
    cors = aiohttp_cors.setup(app, defaults={
        "*": aiohttp_cors.ResourceOptions(
            allow_credentials=True,
            expose_headers="*",
            allow_headers="*",
            allow_methods="*"
        )
    })
    
    # 라우트 설정
    rpc_resource = app.router.add_post('/rpc', handle_rpc)
    health_resource = app.router.add_get('/health', handle_health)
    
    # CORS 적용
    cors.add(rpc_resource)
    cors.add(health_resource)
    
    return app

async def main():
    """메인 함수"""
    app = await create_app()
    
    print("🚀 테스트 로그 서버 시작")
    print("📍 Health: http://localhost:8888/health")
    print("📍 RPC: http://localhost:8888/rpc")
    print("🌐 CORS: 모든 도메인 허용")
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', 8888)
    await site.start()
    
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        print("\n✅ 서버 종료")

if __name__ == '__main__':
    asyncio.run(main()) 