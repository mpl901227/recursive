/**
 * Frontend Component Template Generator
 * 프론트엔드 컴포넌트 자동 생성 템플릿
 */

const fs = require('fs');
const path = require('path');

/**
 * React 컴포넌트 템플릿 생성
 */
function generateReactComponent(componentName, options = {}) {
    const {
        type = 'functional', // 'functional' | 'class'
        hooks = [],
        props = [],
        styling = 'css', // 'css' | 'styled-components' | 'tailwind'
        typescript = false
    } = options;

    const fileExtension = typescript ? '.tsx' : '.jsx';
    const propsInterface = typescript && props.length > 0 
        ? generatePropsInterface(componentName, props) 
        : '';

    let template = '';

    if (typescript) {
        template += `import React${hooks.length > 0 ? `, { ${hooks.join(', ')} }` : ''} from 'react';\n`;
    } else {
        template += `import React${hooks.length > 0 ? `, { ${hooks.join(', ')} }` : ''} from 'react';\n`;
    }

    if (styling === 'styled-components') {
        template += `import styled from 'styled-components';\n`;
    }

    template += `\n`;

    if (propsInterface) {
        template += propsInterface + '\n';
    }

    if (type === 'functional') {
        const propsParam = typescript && props.length > 0 
            ? `{ ${props.map(p => p.name).join(', ')} }: ${componentName}Props`
            : props.length > 0 
                ? `{ ${props.map(p => p.name).join(', ')} }`
                : '';

        template += `const ${componentName} = (${propsParam}) => {\n`;
        
        // 상태 관리 hooks
        if (hooks.includes('useState')) {
            template += `  const [state, setState] = useState();\n`;
        }
        if (hooks.includes('useEffect')) {
            template += `\n  useEffect(() => {\n    // Effect logic here\n  }, []);\n`;
        }

        template += `\n  return (\n`;
        template += `    <div className="${componentName.toLowerCase()}">\n`;
        template += `      <h1>${componentName} Component</h1>\n`;
        
        if (props.length > 0) {
            props.forEach(prop => {
                template += `      <p>{${prop.name}}</p>\n`;
            });
        }
        
        template += `    </div>\n`;
        template += `  );\n`;
        template += `};\n\n`;
    } else {
        // Class component
        const extendsClause = typescript ? 'React.Component<any, any>' : 'React.Component';
        template += `class ${componentName} extends ${extendsClause} {\n`;
        template += `  constructor(props) {\n`;
        template += `    super(props);\n`;
        template += `    this.state = {};\n`;
        template += `  }\n\n`;
        template += `  render() {\n`;
        template += `    return (\n`;
        template += `      <div className="${componentName.toLowerCase()}">\n`;
        template += `        <h1>${componentName} Component</h1>\n`;
        template += `      </div>\n`;
        template += `    );\n`;
        template += `  }\n`;
        template += `}\n\n`;
    }

    template += `export default ${componentName};\n`;

    return {
        filename: `${componentName}${fileExtension}`,
        content: template,
        cssFile: generateComponentCSS(componentName, styling)
    };
}

/**
 * Props 인터페이스 생성 (TypeScript)
 */
function generatePropsInterface(componentName, props) {
    let interface = `interface ${componentName}Props {\n`;
    props.forEach(prop => {
        const optional = prop.required ? '' : '?';
        interface += `  ${prop.name}${optional}: ${prop.type};\n`;
    });
    interface += `}\n`;
    return interface;
}

/**
 * 컴포넌트 CSS 생성
 */
function generateComponentCSS(componentName, styling) {
    const className = componentName.toLowerCase();
    
    if (styling === 'styled-components') {
        return {
            filename: null,
            content: `
const StyledContainer = styled.div\`
  padding: 1rem;
  margin: 1rem 0;
  border: 1px solid #ddd;
  border-radius: 4px;
  
  h1 {
    margin: 0 0 1rem 0;
    color: #333;
  }
\`;`
        };
    }
    
    if (styling === 'tailwind') {
        return {
            filename: null,
            content: `// Tailwind classes: p-4 m-4 border border-gray-300 rounded`
        };
    }
    
    // Regular CSS
    return {
        filename: `${componentName}.css`,
        content: `.${className} {
  padding: 1rem;
  margin: 1rem 0;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.${className} h1 {
  margin: 0 0 1rem 0;
  color: #333;
}

.${className} p {
  margin: 0.5rem 0;
  color: #666;
}`
    };
}

/**
 * Vue 컴포넌트 템플릿 생성
 */
function generateVueComponent(componentName, options = {}) {
    const {
        composition = true, // Composition API vs Options API
        typescript = false,
        props = [],
        styling = 'css'
    } = options;

    const fileExtension = '.vue';
    let template = `<template>\n`;
    template += `  <div class="${componentName.toLowerCase()}">\n`;
    template += `    <h1>${componentName} Component</h1>\n`;
    
    if (props.length > 0) {
        props.forEach(prop => {
            template += `    <p>{{ ${prop.name} }}</p>\n`;
        });
    }
    
    template += `  </div>\n`;
    template += `</template>\n\n`;

    if (composition) {
        template += `<script${typescript ? ' lang="ts"' : ''}>\n`;
        template += `import { ref, onMounted } from 'vue';\n\n`;
        template += `export default {\n`;
        template += `  name: '${componentName}',\n`;
        
        if (props.length > 0) {
            template += `  props: {\n`;
            props.forEach((prop, index) => {
                template += `    ${prop.name}: {\n`;
                template += `      type: ${prop.type},\n`;
                template += `      ${prop.required ? 'required: true' : 'default: null'}\n`;
                template += `    }${index < props.length - 1 ? ',' : ''}\n`;
            });
            template += `  },\n`;
        }
        
        template += `  setup(props) {\n`;
        template += `    const state = ref(null);\n\n`;
        template += `    onMounted(() => {\n`;
        template += `      // Component mounted logic\n`;
        template += `    });\n\n`;
        template += `    return {\n`;
        template += `      state\n`;
        template += `    };\n`;
        template += `  }\n`;
        template += `};\n`;
        template += `</script>\n\n`;
    } else {
        // Options API
        template += `<script${typescript ? ' lang="ts"' : ''}>\n`;
        template += `export default {\n`;
        template += `  name: '${componentName}',\n`;
        
        if (props.length > 0) {
            template += `  props: {\n`;
            props.forEach((prop, index) => {
                template += `    ${prop.name}: {\n`;
                template += `      type: ${prop.type},\n`;
                template += `      ${prop.required ? 'required: true' : 'default: null'}\n`;
                template += `    }${index < props.length - 1 ? ',' : ''}\n`;
            });
            template += `  },\n`;
        }
        
        template += `  data() {\n`;
        template += `    return {\n`;
        template += `      state: null\n`;
        template += `    };\n`;
        template += `  },\n`;
        template += `  mounted() {\n`;
        template += `    // Component mounted logic\n`;
        template += `  }\n`;
        template += `};\n`;
        template += `</script>\n\n`;
    }

    // CSS
    template += `<style scoped>\n`;
    template += `.${componentName.toLowerCase()} {\n`;
    template += `  padding: 1rem;\n`;
    template += `  margin: 1rem 0;\n`;
    template += `  border: 1px solid #ddd;\n`;
    template += `  border-radius: 4px;\n`;
    template += `}\n\n`;
    template += `.${componentName.toLowerCase()} h1 {\n`;
    template += `  margin: 0 0 1rem 0;\n`;
    template += `  color: #333;\n`;
    template += `}\n`;
    template += `</style>\n`;

    return {
        filename: `${componentName}${fileExtension}`,
        content: template
    };
}

/**
 * Angular 컴포넌트 템플릿 생성
 */
function generateAngularComponent(componentName, options = {}) {
    const {
        standalone = true,
        inputs = [],
        outputs = []
    } = options;

    const kebabName = componentName.replace(/([A-Z])/g, '-$1').toLowerCase().substring(1);
    const selectorName = `app-${kebabName}`;

    // TypeScript Component
    let tsTemplate = `import { Component${inputs.length > 0 ? ', Input' : ''}${outputs.length > 0 ? ', Output, EventEmitter' : ''} } from '@angular/core';\n`;
    
    if (standalone) {
        tsTemplate += `import { CommonModule } from '@angular/common';\n`;
    }
    
    tsTemplate += `\n@Component({\n`;
    tsTemplate += `  selector: '${selectorName}',\n`;
    
    if (standalone) {
        tsTemplate += `  standalone: true,\n`;
        tsTemplate += `  imports: [CommonModule],\n`;
    }
    
    tsTemplate += `  templateUrl: './${kebabName}.component.html',\n`;
    tsTemplate += `  styleUrls: ['./${kebabName}.component.css']\n`;
    tsTemplate += `})\n`;
    tsTemplate += `export class ${componentName}Component {\n`;
    
    // Inputs
    if (inputs.length > 0) {
        inputs.forEach(input => {
            tsTemplate += `  @Input() ${input.name}!: ${input.type};\n`;
        });
        tsTemplate += `\n`;
    }
    
    // Outputs
    if (outputs.length > 0) {
        outputs.forEach(output => {
            tsTemplate += `  @Output() ${output.name} = new EventEmitter<${output.type}>();\n`;
        });
        tsTemplate += `\n`;
    }
    
    tsTemplate += `  constructor() {}\n\n`;
    tsTemplate += `  ngOnInit(): void {\n`;
    tsTemplate += `    // Component initialization logic\n`;
    tsTemplate += `  }\n`;
    tsTemplate += `}\n`;

    // HTML Template
    let htmlTemplate = `<div class="${kebabName}">\n`;
    htmlTemplate += `  <h1>${componentName} Component</h1>\n`;
    
    if (inputs.length > 0) {
        inputs.forEach(input => {
            htmlTemplate += `  <p>{{ ${input.name} }}</p>\n`;
        });
    }
    
    htmlTemplate += `</div>\n`;

    // CSS
    let cssTemplate = `.${kebabName} {\n`;
    cssTemplate += `  padding: 1rem;\n`;
    cssTemplate += `  margin: 1rem 0;\n`;
    cssTemplate += `  border: 1px solid #ddd;\n`;
    cssTemplate += `  border-radius: 4px;\n`;
    cssTemplate += `}\n\n`;
    cssTemplate += `.${kebabName} h1 {\n`;
    cssTemplate += `  margin: 0 0 1rem 0;\n`;
    cssTemplate += `  color: #333;\n`;
    cssTemplate += `}\n`;

    return {
        typescript: {
            filename: `${kebabName}.component.ts`,
            content: tsTemplate
        },
        html: {
            filename: `${kebabName}.component.html`,
            content: htmlTemplate
        },
        css: {
            filename: `${kebabName}.component.css`,
            content: cssTemplate
        }
    };
}

/**
 * 컴포넌트 파일 생성
 */
function createComponentFiles(outputDir, componentData) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const files = [];

    if (componentData.filename) {
        // React/Vue single file
        const filePath = path.join(outputDir, componentData.filename);
        fs.writeFileSync(filePath, componentData.content);
        files.push(filePath);

        // CSS file if exists
        if (componentData.cssFile && componentData.cssFile.filename) {
            const cssPath = path.join(outputDir, componentData.cssFile.filename);
            fs.writeFileSync(cssPath, componentData.cssFile.content);
            files.push(cssPath);
        }
    } else {
        // Angular multiple files
        Object.keys(componentData).forEach(key => {
            const file = componentData[key];
            if (file.filename && file.content) {
                const filePath = path.join(outputDir, file.filename);
                fs.writeFileSync(filePath, file.content);
                files.push(filePath);
            }
        });
    }

    return files;
}

module.exports = {
    generateReactComponent,
    generateVueComponent,
    generateAngularComponent,
    createComponentFiles
}; 