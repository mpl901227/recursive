#!/usr/bin/env python3
"""
Graph Analysis Utilities
그래프 구조 분석 및 시각화 도구들
"""

import os
import re
from typing import Dict, List, Any, Optional, Set, Tuple, Union
from pathlib import Path
from collections import defaultdict, deque
from dataclasses import dataclass
import json


@dataclass
class GraphNode:
    """그래프 노드 정보"""
    id: str
    name: str
    node_type: str
    metadata: Dict[str, Any] = None


@dataclass
class GraphEdge:
    """그래프 엣지 정보"""
    source: str
    target: str
    edge_type: str
    weight: float = 1.0
    metadata: Dict[str, Any] = None


class DependencyGraph:
    """의존성 그래프 클래스"""
    
    def __init__(self):
        self.nodes: Dict[str, GraphNode] = {}
        self.edges: List[GraphEdge] = []
        self.adjacency_list: Dict[str, List[str]] = defaultdict(list)
        self.reverse_adjacency_list: Dict[str, List[str]] = defaultdict(list)
    
    def add_node(self, node: GraphNode):
        """노드 추가"""
        self.nodes[node.id] = node
        if node.id not in self.adjacency_list:
            self.adjacency_list[node.id] = []
        if node.id not in self.reverse_adjacency_list:
            self.reverse_adjacency_list[node.id] = []
    
    def add_edge(self, edge: GraphEdge):
        """엣지 추가"""
        self.edges.append(edge)
        self.adjacency_list[edge.source].append(edge.target)
        self.reverse_adjacency_list[edge.target].append(edge.source)
    
    def get_dependencies(self, node_id: str) -> List[str]:
        """노드의 의존성 목록 반환"""
        return self.adjacency_list.get(node_id, [])
    
    def get_dependents(self, node_id: str) -> List[str]:
        """노드에 의존하는 노드들 반환"""
        return self.reverse_adjacency_list.get(node_id, [])
    
    def find_circular_dependencies(self) -> List[List[str]]:
        """순환 의존성 찾기"""
        visited = set()
        rec_stack = set()
        cycles = []
        
        def dfs(node, path):
            if node in rec_stack:
                # 순환 발견
                cycle_start = path.index(node)
                cycle = path[cycle_start:] + [node]
                cycles.append(cycle)
                return
            
            if node in visited:
                return
            
            visited.add(node)
            rec_stack.add(node)
            path.append(node)
            
            for neighbor in self.adjacency_list.get(node, []):
                dfs(neighbor, path.copy())
            
            rec_stack.remove(node)
        
        for node_id in self.nodes:
            if node_id not in visited:
                dfs(node_id, [])
        
        return cycles
    
    def calculate_metrics(self) -> Dict[str, Any]:
        """그래프 메트릭 계산"""
        metrics = {
            "total_nodes": len(self.nodes),
            "total_edges": len(self.edges),
            "node_metrics": {},
            "graph_metrics": {}
        }
        
        # 노드별 메트릭
        for node_id in self.nodes:
            in_degree = len(self.reverse_adjacency_list[node_id])
            out_degree = len(self.adjacency_list[node_id])
            
            metrics["node_metrics"][node_id] = {
                "in_degree": in_degree,
                "out_degree": out_degree,
                "total_degree": in_degree + out_degree
            }
        
        # 전체 그래프 메트릭
        if self.nodes:
            degrees = [m["total_degree"] for m in metrics["node_metrics"].values()]
            metrics["graph_metrics"] = {
                "avg_degree": sum(degrees) / len(degrees),
                "max_degree": max(degrees),
                "min_degree": min(degrees),
                "density": len(self.edges) / (len(self.nodes) * (len(self.nodes) - 1)) if len(self.nodes) > 1 else 0
            }
        
        return metrics
    
    def get_strongly_connected_components(self) -> List[List[str]]:
        """강연결 성분 찾기 (Tarjan's algorithm)"""
        index_counter = [0]
        stack = []
        lowlinks = {}
        indices = {}
        on_stack = {}
        components = []
        
        def strongconnect(node):
            indices[node] = index_counter[0]
            lowlinks[node] = index_counter[0]
            index_counter[0] += 1
            stack.append(node)
            on_stack[node] = True
            
            for neighbor in self.adjacency_list.get(node, []):
                if neighbor not in indices:
                    strongconnect(neighbor)
                    lowlinks[node] = min(lowlinks[node], lowlinks[neighbor])
                elif on_stack.get(neighbor, False):
                    lowlinks[node] = min(lowlinks[node], indices[neighbor])
            
            if lowlinks[node] == indices[node]:
                component = []
                while True:
                    w = stack.pop()
                    on_stack[w] = False
                    component.append(w)
                    if w == node:
                        break
                components.append(component)
        
        for node in self.nodes:
            if node not in indices:
                strongconnect(node)
        
        return components
    
    def topological_sort(self) -> Optional[List[str]]:
        """위상 정렬"""
        # 순환이 있으면 None 반환
        if self.find_circular_dependencies():
            return None
        
        in_degree = {node_id: 0 for node_id in self.nodes}
        for node_id in self.nodes:
            for neighbor in self.adjacency_list[node_id]:
                in_degree[neighbor] += 1
        
        queue = deque([node for node, degree in in_degree.items() if degree == 0])
        result = []
        
        while queue:
            node = queue.popleft()
            result.append(node)
            
            for neighbor in self.adjacency_list[node]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)
        
        return result if len(result) == len(self.nodes) else None
    
    def to_dict(self) -> Dict[str, Any]:
        """그래프를 딕셔너리로 변환"""
        return {
            "nodes": [
                {
                    "id": node.id,
                    "name": node.name,
                    "type": node.node_type,
                    "metadata": node.metadata or {}
                }
                for node in self.nodes.values()
            ],
            "edges": [
                {
                    "source": edge.source,
                    "target": edge.target,
                    "type": edge.edge_type,
                    "weight": edge.weight,
                    "metadata": edge.metadata or {}
                }
                for edge in self.edges
            ]
        }
    
    def from_dict(self, data: Dict[str, Any]):
        """딕셔너리에서 그래프 복원"""
        self.nodes.clear()
        self.edges.clear()
        self.adjacency_list.clear()
        self.reverse_adjacency_list.clear()
        
        # 노드 추가
        for node_data in data.get("nodes", []):
            node = GraphNode(
                id=node_data["id"],
                name=node_data["name"],
                node_type=node_data["type"],
                metadata=node_data.get("metadata", {})
            )
            self.add_node(node)
        
        # 엣지 추가
        for edge_data in data.get("edges", []):
            edge = GraphEdge(
                source=edge_data["source"],
                target=edge_data["target"],
                edge_type=edge_data["type"],
                weight=edge_data.get("weight", 1.0),
                metadata=edge_data.get("metadata", {})
            )
            self.add_edge(edge)


class DependencyAnalyzer:
    """의존성 분석기"""
    
    def __init__(self):
        self.graph = DependencyGraph()
    
    def analyze_file_dependencies(self, file_analyses: Dict[str, Any]) -> DependencyGraph:
        """파일 분석 결과에서 의존성 그래프 구축"""
        self.graph = DependencyGraph()
        
        # 파일 노드 추가
        for file_path, analysis in file_analyses.items():
            if "content_analysis" not in analysis:
                continue
            
            file_info = analysis.get("file_info", {})
            node = GraphNode(
                id=file_path,
                name=Path(file_path).name,
                node_type="file",
                metadata={
                    "language": analysis["content_analysis"].get("language", "unknown"),
                    "size": file_info.get("size", 0),
                    "functions": len(analysis["content_analysis"].get("functions", [])),
                    "classes": len(analysis["content_analysis"].get("classes", []))
                }
            )
            self.graph.add_node(node)
        
        # 의존성 엣지 추가
        for file_path, analysis in file_analyses.items():
            if "content_analysis" not in analysis:
                continue
            
            imports = analysis["content_analysis"].get("imports", [])
            for imp in imports:
                target_file = self._resolve_import_to_file(imp, file_path, file_analyses)
                if target_file and target_file in self.graph.nodes:
                    edge = GraphEdge(
                        source=file_path,
                        target=target_file,
                        edge_type="import",
                        metadata={"import_info": imp}
                    )
                    self.graph.add_edge(edge)
        
        return self.graph
    
    def _resolve_import_to_file(self, import_info: Dict, current_file: str, all_files: Dict) -> Optional[str]:
        """Import를 실제 파일 경로로 해결"""
        module = import_info.get("module", "")
        if not module:
            return None
        
        # 로컬 파일 import인지 확인
        if module.startswith("."):
            # 상대 경로 import
            current_dir = Path(current_file).parent
            if module == ".":
                # 같은 디렉토리
                target_dir = current_dir
            else:
                # 상위/하위 디렉토리
                level = module.count(".")
                target_dir = current_dir
                for _ in range(level - 1):
                    target_dir = target_dir.parent
                
                if len(module.split(".")) > level:
                    submodule = module.split(".")[level]
                    target_dir = target_dir / submodule
            
            # 가능한 파일 확장자들
            extensions = [".py", ".js", ".ts", ".jsx", ".tsx"]
            for ext in extensions:
                potential_file = str(target_dir / f"__init__{ext}")
                if potential_file in all_files:
                    return potential_file
                
                potential_file = str(target_dir.with_suffix(ext))
                if potential_file in all_files:
                    return potential_file
        
        else:
            # 절대 경로 또는 패키지 import
            # 프로젝트 내에서 찾기
            for file_path in all_files:
                if module in file_path or Path(file_path).stem == module:
                    return file_path
        
        return None
    
    def generate_dependency_report(self) -> Dict[str, Any]:
        """의존성 분석 보고서 생성"""
        metrics = self.graph.calculate_metrics()
        cycles = self.graph.find_circular_dependencies()
        components = self.graph.get_strongly_connected_components()
        
        # 의존성이 많은 파일들 (높은 out-degree)
        high_dependency_files = sorted(
            metrics["node_metrics"].items(),
            key=lambda x: x[1]["out_degree"],
            reverse=True
        )[:10]
        
        # 많이 의존받는 파일들 (높은 in-degree)
        highly_depended_files = sorted(
            metrics["node_metrics"].items(),
            key=lambda x: x[1]["in_degree"],
            reverse=True
        )[:10]
        
        return {
            "summary": {
                "total_files": metrics["total_nodes"],
                "total_dependencies": metrics["total_edges"],
                "circular_dependencies": len(cycles),
                "strongly_connected_components": len(components)
            },
            "metrics": metrics,
            "circular_dependencies": cycles,
            "high_dependency_files": high_dependency_files,
            "highly_depended_files": highly_depended_files,
            "recommendations": self._generate_recommendations(cycles, high_dependency_files)
        }
    
    def _generate_recommendations(self, cycles: List[List[str]], high_deps: List[Tuple]) -> List[str]:
        """개선 권장사항 생성"""
        recommendations = []
        
        if cycles:
            recommendations.append(f"순환 의존성 {len(cycles)}개를 해결하세요.")
            for i, cycle in enumerate(cycles[:3]):  # 최대 3개만 표시
                recommendations.append(f"  순환 {i+1}: {' -> '.join(cycle)}")
        
        if high_deps:
            top_file = high_deps[0]
            if top_file[1]["out_degree"] > 10:
                recommendations.append(f"{top_file[0]} 파일이 {top_file[1]['out_degree']}개 파일에 의존합니다. 리팩토링을 고려하세요.")
        
        return recommendations


class GraphVisualizer:
    """그래프 시각화기"""
    
    def __init__(self):
        self.has_visualization = self._check_visualization_libs()
    
    def _check_visualization_libs(self) -> bool:
        """시각화 라이브러리 사용 가능 여부 확인"""
        try:
            import matplotlib.pyplot as plt
            import networkx as nx
            return True
        except ImportError:
            return False
    
    def create_mermaid_diagram(self, graph: DependencyGraph, 
                             max_nodes: int = 20,
                             highlight_cycles: bool = True) -> str:
        """Mermaid 다이어그램 생성"""
        lines = ["graph TD"]
        
        # 노드가 너무 많으면 제한
        nodes_to_show = list(graph.nodes.keys())[:max_nodes]
        
        # 노드 정의
        for node_id in nodes_to_show:
            node = graph.nodes[node_id]
            safe_id = self._sanitize_id(node_id)
            safe_name = self._sanitize_name(node.name)
            lines.append(f'    {safe_id}["{safe_name}"]')
        
        # 엣지 정의
        cycles = graph.find_circular_dependencies() if highlight_cycles else []
        cycle_edges = set()
        
        if cycles:
            for cycle in cycles:
                for i in range(len(cycle) - 1):
                    cycle_edges.add((cycle[i], cycle[i + 1]))
        
        for edge in graph.edges:
            if edge.source in nodes_to_show and edge.target in nodes_to_show:
                safe_source = self._sanitize_id(edge.source)
                safe_target = self._sanitize_id(edge.target)
                
                if (edge.source, edge.target) in cycle_edges:
                    lines.append(f'    {safe_source} -->|"cycle"| {safe_target}')
                    lines.append(f'    linkStyle {len(lines)-1} stroke:#ff0000')
                else:
                    lines.append(f'    {safe_source} --> {safe_target}')
        
        return '\n'.join(lines)
    
    def create_ascii_diagram(self, graph: DependencyGraph) -> str:
        """ASCII 다이어그램 생성"""
        lines = ["Dependency Graph:"]
        lines.append("=" * 50)
        
        for node_id, node in graph.nodes.items():
            dependencies = graph.get_dependencies(node_id)
            dependents = graph.get_dependents(node_id)
            
            lines.append(f"\n{node.name} ({node_id})")
            
            if dependencies:
                lines.append("  Dependencies:")
                for dep in dependencies[:5]:  # 최대 5개만 표시
                    dep_name = graph.nodes[dep].name if dep in graph.nodes else dep
                    lines.append(f"    -> {dep_name}")
                if len(dependencies) > 5:
                    lines.append(f"    ... and {len(dependencies) - 5} more")
            
            if dependents:
                lines.append("  Dependents:")
                for dep in dependents[:5]:  # 최대 5개만 표시
                    dep_name = graph.nodes[dep].name if dep in graph.nodes else dep
                    lines.append(f"    <- {dep_name}")
                if len(dependents) > 5:
                    lines.append(f"    ... and {len(dependents) - 5} more")
        
        return '\n'.join(lines)
    
    def _sanitize_id(self, node_id: str) -> str:
        """Mermaid ID를 위한 문자열 정리"""
        # 특수문자를 언더스코어로 변경
        sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', node_id)
        # 숫자로 시작하면 앞에 'n' 추가
        if sanitized[0].isdigit():
            sanitized = 'n' + sanitized
        return sanitized
    
    def _sanitize_name(self, name: str) -> str:
        """Mermaid 노드 이름을 위한 문자열 정리"""
        # 특수문자 이스케이프
        return name.replace('"', '\\"').replace('[', '\\[').replace(']', '\\]')


# 편의 함수들
def analyze_dependencies(file_analyses: Dict[str, Any]) -> Dict[str, Any]:
    """의존성 분석 (편의 함수)"""
    analyzer = DependencyAnalyzer()
    graph = analyzer.analyze_file_dependencies(file_analyses)
    return analyzer.generate_dependency_report()


def find_circular_dependencies(file_analyses: Dict[str, Any]) -> List[List[str]]:
    """순환 의존성 찾기 (편의 함수)"""
    analyzer = DependencyAnalyzer()
    graph = analyzer.analyze_file_dependencies(file_analyses)
    return graph.find_circular_dependencies()


def create_dependency_diagram(file_analyses: Dict[str, Any], 
                            format: str = "mermaid") -> str:
    """의존성 다이어그램 생성 (편의 함수)"""
    analyzer = DependencyAnalyzer()
    graph = analyzer.analyze_file_dependencies(file_analyses)
    
    visualizer = GraphVisualizer()
    
    if format == "mermaid":
        return visualizer.create_mermaid_diagram(graph)
    elif format == "ascii":
        return visualizer.create_ascii_diagram(graph)
    else:
        raise ValueError(f"Unsupported format: {format}")


def calculate_coupling_metrics(file_analyses: Dict[str, Any]) -> Dict[str, Any]:
    """결합도 메트릭 계산 (편의 함수)"""
    analyzer = DependencyAnalyzer()
    graph = analyzer.analyze_file_dependencies(file_analyses)
    return graph.calculate_metrics() 