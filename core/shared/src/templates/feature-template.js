/**
 * Backend Feature Template Generator
 * 백엔드 기능 자동 생성 템플릿
 */

const fs = require('fs');
const path = require('path');

/**
 * Express.js API 엔드포인트 템플릿 생성
 */
function generateExpressEndpoint(featureName, options = {}) {
    const {
        methods = ['GET', 'POST'],
        middleware = [],
        validation = false,
        database = 'none', // 'none' | 'mongodb' | 'postgres' | 'mysql'
        authentication = false
    } = options;

    let template = '';

    // Imports
    template += `const express = require('express');\n`;
    template += `const router = express.Router();\n`;
    
    if (validation) {
        template += `const { body, validationResult } = require('express-validator');\n`;
    }
    
    if (authentication) {
        template += `const auth = require('../middleware/auth');\n`;
    }
    
    if (database === 'mongodb') {
        template += `const ${featureName}Model = require('../models/${featureName}');\n`;
    } else if (database === 'postgres' || database === 'mysql') {
        template += `const db = require('../config/database');\n`;
    }
    
    template += `\n`;

    // Validation rules
    if (validation) {
        template += `// Validation rules\n`;
        template += `const validate${featureName} = [\n`;
        template += `  body('name').notEmpty().withMessage('Name is required'),\n`;
        template += `  body('description').optional().isLength({ min: 10 }).withMessage('Description must be at least 10 characters')\n`;
        template += `];\n\n`;
    }

    // Generate endpoints for each method
    methods.forEach(method => {
        const methodLower = method.toLowerCase();
        const routePath = methodLower === 'get' ? '/' : '/';
        
        template += `// ${method} ${featureName}\n`;
        template += `router.${methodLower}('${routePath}'`;
        
        // Add middleware
        if (authentication) {
            template += `, auth`;
        }
        
        if (validation && (method === 'POST' || method === 'PUT')) {
            template += `, validate${featureName}`;
        }
        
        template += `, async (req, res) => {\n`;
        template += `  try {\n`;
        
        // Validation error handling
        if (validation && (method === 'POST' || method === 'PUT')) {
            template += `    const errors = validationResult(req);\n`;
            template += `    if (!errors.isEmpty()) {\n`;
            template += `      return res.status(400).json({ errors: errors.array() });\n`;
            template += `    }\n\n`;
        }
        
        // Method-specific logic
        switch (method) {
            case 'GET':
                template += generateGetLogic(featureName, database);
                break;
            case 'POST':
                template += generatePostLogic(featureName, database);
                break;
            case 'PUT':
                template += generatePutLogic(featureName, database);
                break;
            case 'DELETE':
                template += generateDeleteLogic(featureName, database);
                break;
        }
        
        template += `  } catch (error) {\n`;
        template += `    console.error('Error in ${method} ${featureName}:', error);\n`;
        template += `    res.status(500).json({ error: 'Internal server error' });\n`;
        template += `  }\n`;
        template += `});\n\n`;
    });

    template += `module.exports = router;\n`;

    return {
        filename: `${featureName}.js`,
        content: template
    };
}

function generateGetLogic(featureName, database) {
    let logic = '';
    
    switch (database) {
        case 'mongodb':
            logic += `    const items = await ${featureName}Model.find();\n`;
            logic += `    res.json(items);\n`;
            break;
        case 'postgres':
        case 'mysql':
            logic += `    const query = 'SELECT * FROM ${featureName.toLowerCase()}s';\n`;
            logic += `    const result = await db.query(query);\n`;
            logic += `    res.json(result.rows || result);\n`;
            break;
        default:
            logic += `    // Mock data - replace with actual database logic\n`;
            logic += `    const mockData = [\n`;
            logic += `      { id: 1, name: 'Sample ${featureName}', description: 'This is a sample item' }\n`;
            logic += `    ];\n`;
            logic += `    res.json(mockData);\n`;
    }
    
    return logic;
}

function generatePostLogic(featureName, database) {
    let logic = '';
    
    switch (database) {
        case 'mongodb':
            logic += `    const newItem = new ${featureName}Model(req.body);\n`;
            logic += `    const savedItem = await newItem.save();\n`;
            logic += `    res.status(201).json(savedItem);\n`;
            break;
        case 'postgres':
        case 'mysql':
            logic += `    const { name, description } = req.body;\n`;
            logic += `    const query = 'INSERT INTO ${featureName.toLowerCase()}s (name, description) VALUES ($1, $2) RETURNING *';\n`;
            logic += `    const result = await db.query(query, [name, description]);\n`;
            logic += `    res.status(201).json(result.rows[0] || result);\n`;
            break;
        default:
            logic += `    // Mock creation - replace with actual database logic\n`;
            logic += `    const newItem = {\n`;
            logic += `      id: Date.now(),\n`;
            logic += `      ...req.body,\n`;
            logic += `      createdAt: new Date()\n`;
            logic += `    };\n`;
            logic += `    res.status(201).json(newItem);\n`;
    }
    
    return logic;
}

function generatePutLogic(featureName, database) {
    let logic = '';
    
    switch (database) {
        case 'mongodb':
            logic += `    const { id } = req.params;\n`;
            logic += `    const updatedItem = await ${featureName}Model.findByIdAndUpdate(id, req.body, { new: true });\n`;
            logic += `    if (!updatedItem) {\n`;
            logic += `      return res.status(404).json({ error: '${featureName} not found' });\n`;
            logic += `    }\n`;
            logic += `    res.json(updatedItem);\n`;
            break;
        case 'postgres':
        case 'mysql':
            logic += `    const { id } = req.params;\n`;
            logic += `    const { name, description } = req.body;\n`;
            logic += `    const query = 'UPDATE ${featureName.toLowerCase()}s SET name = $1, description = $2 WHERE id = $3 RETURNING *';\n`;
            logic += `    const result = await db.query(query, [name, description, id]);\n`;
            logic += `    if (result.rows.length === 0) {\n`;
            logic += `      return res.status(404).json({ error: '${featureName} not found' });\n`;
            logic += `    }\n`;
            logic += `    res.json(result.rows[0]);\n`;
            break;
        default:
            logic += `    // Mock update - replace with actual database logic\n`;
            logic += `    const { id } = req.params;\n`;
            logic += `    const updatedItem = {\n`;
            logic += `      id: parseInt(id),\n`;
            logic += `      ...req.body,\n`;
            logic += `      updatedAt: new Date()\n`;
            logic += `    };\n`;
            logic += `    res.json(updatedItem);\n`;
    }
    
    return logic;
}

function generateDeleteLogic(featureName, database) {
    let logic = '';
    
    switch (database) {
        case 'mongodb':
            logic += `    const { id } = req.params;\n`;
            logic += `    const deletedItem = await ${featureName}Model.findByIdAndDelete(id);\n`;
            logic += `    if (!deletedItem) {\n`;
            logic += `      return res.status(404).json({ error: '${featureName} not found' });\n`;
            logic += `    }\n`;
            logic += `    res.json({ message: '${featureName} deleted successfully' });\n`;
            break;
        case 'postgres':
        case 'mysql':
            logic += `    const { id } = req.params;\n`;
            logic += `    const query = 'DELETE FROM ${featureName.toLowerCase()}s WHERE id = $1 RETURNING *';\n`;
            logic += `    const result = await db.query(query, [id]);\n`;
            logic += `    if (result.rows.length === 0) {\n`;
            logic += `      return res.status(404).json({ error: '${featureName} not found' });\n`;
            logic += `    }\n`;
            logic += `    res.json({ message: '${featureName} deleted successfully' });\n`;
            break;
        default:
            logic += `    // Mock deletion - replace with actual database logic\n`;
            logic += `    const { id } = req.params;\n`;
            logic += `    res.json({ message: \`${featureName} with id \${id} deleted successfully\` });\n`;
    }
    
    return logic;
}

/**
 * Database Model 템플릿 생성
 */
function generateDatabaseModel(modelName, options = {}) {
    const {
        database = 'mongodb',
        fields = []
    } = options;

    let template = '';

    switch (database) {
        case 'mongodb':
            template += `const mongoose = require('mongoose');\n\n`;
            template += `const ${modelName}Schema = new mongoose.Schema({\n`;
            
            if (fields.length > 0) {
                fields.forEach((field, index) => {
                    template += `  ${field.name}: {\n`;
                    template += `    type: ${field.type},\n`;
                    if (field.required) template += `    required: true,\n`;
                    if (field.unique) template += `    unique: true,\n`;
                    if (field.default !== undefined) template += `    default: ${field.default},\n`;
                    template += `  }${index < fields.length - 1 ? ',' : ''}\n`;
                });
            } else {
                template += `  name: {\n`;
                template += `    type: String,\n`;
                template += `    required: true\n`;
                template += `  },\n`;
                template += `  description: {\n`;
                template += `    type: String,\n`;
                template += `    default: ''\n`;
                template += `  }\n`;
            }
            
            template += `}, {\n`;
            template += `  timestamps: true\n`;
            template += `});\n\n`;
            template += `module.exports = mongoose.model('${modelName}', ${modelName}Schema);\n`;
            break;

        case 'postgres':
        case 'mysql':
            template += `-- ${modelName} table creation\n`;
            template += `CREATE TABLE ${modelName.toLowerCase()}s (\n`;
            template += `  id SERIAL PRIMARY KEY,\n`;
            
            if (fields.length > 0) {
                fields.forEach(field => {
                    template += `  ${field.name} ${field.sqlType || 'VARCHAR(255)'}`;
                    if (field.required) template += ` NOT NULL`;
                    if (field.unique) template += ` UNIQUE`;
                    if (field.default !== undefined) template += ` DEFAULT ${field.default}`;
                    template += `,\n`;
                });
            } else {
                template += `  name VARCHAR(255) NOT NULL,\n`;
                template += `  description TEXT,\n`;
            }
            
            template += `  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n`;
            template += `  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n`;
            template += `);\n`;
            break;
    }

    return {
        filename: database === 'mongodb' ? `${modelName}.js` : `${modelName.toLowerCase()}.sql`,
        content: template
    };
}

/**
 * 서비스 레이어 템플릿 생성
 */
function generateService(serviceName, options = {}) {
    const {
        database = 'none',
        methods = ['create', 'findAll', 'findById', 'update', 'delete']
    } = options;

    let template = '';

    if (database === 'mongodb') {
        template += `const ${serviceName}Model = require('../models/${serviceName}');\n\n`;
    } else if (database === 'postgres' || database === 'mysql') {
        template += `const db = require('../config/database');\n\n`;
    }

    template += `class ${serviceName}Service {\n`;

    methods.forEach(method => {
        switch (method) {
            case 'create':
                template += generateServiceCreateMethod(serviceName, database);
                break;
            case 'findAll':
                template += generateServiceFindAllMethod(serviceName, database);
                break;
            case 'findById':
                template += generateServiceFindByIdMethod(serviceName, database);
                break;
            case 'update':
                template += generateServiceUpdateMethod(serviceName, database);
                break;
            case 'delete':
                template += generateServiceDeleteMethod(serviceName, database);
                break;
        }
    });

    template += `}\n\n`;
    template += `module.exports = new ${serviceName}Service();\n`;

    return {
        filename: `${serviceName}Service.js`,
        content: template
    };
}

function generateServiceCreateMethod(serviceName, database) {
    let method = `\n  async create(data) {\n`;
    method += `    try {\n`;
    
    switch (database) {
        case 'mongodb':
            method += `      const item = new ${serviceName}Model(data);\n`;
            method += `      return await item.save();\n`;
            break;
        case 'postgres':
        case 'mysql':
            method += `      const query = 'INSERT INTO ${serviceName.toLowerCase()}s (name, description) VALUES ($1, $2) RETURNING *';\n`;
            method += `      const result = await db.query(query, [data.name, data.description]);\n`;
            method += `      return result.rows[0] || result;\n`;
            break;
        default:
            method += `      // Mock implementation\n`;
            method += `      return { id: Date.now(), ...data, createdAt: new Date() };\n`;
    }
    
    method += `    } catch (error) {\n`;
    method += `      throw new Error(\`Error creating ${serviceName}: \${error.message}\`);\n`;
    method += `    }\n`;
    method += `  }\n`;
    
    return method;
}

function generateServiceFindAllMethod(serviceName, database) {
    let method = `\n  async findAll() {\n`;
    method += `    try {\n`;
    
    switch (database) {
        case 'mongodb':
            method += `      return await ${serviceName}Model.find();\n`;
            break;
        case 'postgres':
        case 'mysql':
            method += `      const query = 'SELECT * FROM ${serviceName.toLowerCase()}s';\n`;
            method += `      const result = await db.query(query);\n`;
            method += `      return result.rows || result;\n`;
            break;
        default:
            method += `      // Mock implementation\n`;
            method += `      return [{ id: 1, name: 'Sample ${serviceName}', description: 'Mock data' }];\n`;
    }
    
    method += `    } catch (error) {\n`;
    method += `      throw new Error(\`Error finding ${serviceName}s: \${error.message}\`);\n`;
    method += `    }\n`;
    method += `  }\n`;
    
    return method;
}

function generateServiceFindByIdMethod(serviceName, database) {
    let method = `\n  async findById(id) {\n`;
    method += `    try {\n`;
    
    switch (database) {
        case 'mongodb':
            method += `      return await ${serviceName}Model.findById(id);\n`;
            break;
        case 'postgres':
        case 'mysql':
            method += `      const query = 'SELECT * FROM ${serviceName.toLowerCase()}s WHERE id = $1';\n`;
            method += `      const result = await db.query(query, [id]);\n`;
            method += `      return result.rows[0] || result[0];\n`;
            break;
        default:
            method += `      // Mock implementation\n`;
            method += `      return { id, name: \`Sample ${serviceName} \${id}\`, description: 'Mock data' };\n`;
    }
    
    method += `    } catch (error) {\n`;
    method += `      throw new Error(\`Error finding ${serviceName}: \${error.message}\`);\n`;
    method += `    }\n`;
    method += `  }\n`;
    
    return method;
}

function generateServiceUpdateMethod(serviceName, database) {
    let method = `\n  async update(id, data) {\n`;
    method += `    try {\n`;
    
    switch (database) {
        case 'mongodb':
            method += `      return await ${serviceName}Model.findByIdAndUpdate(id, data, { new: true });\n`;
            break;
        case 'postgres':
        case 'mysql':
            method += `      const query = 'UPDATE ${serviceName.toLowerCase()}s SET name = $1, description = $2 WHERE id = $3 RETURNING *';\n`;
            method += `      const result = await db.query(query, [data.name, data.description, id]);\n`;
            method += `      return result.rows[0] || result[0];\n`;
            break;
        default:
            method += `      // Mock implementation\n`;
            method += `      return { id, ...data, updatedAt: new Date() };\n`;
    }
    
    method += `    } catch (error) {\n`;
    method += `      throw new Error(\`Error updating ${serviceName}: \${error.message}\`);\n`;
    method += `    }\n`;
    method += `  }\n`;
    
    return method;
}

function generateServiceDeleteMethod(serviceName, database) {
    let method = `\n  async delete(id) {\n`;
    method += `    try {\n`;
    
    switch (database) {
        case 'mongodb':
            method += `      return await ${serviceName}Model.findByIdAndDelete(id);\n`;
            break;
        case 'postgres':
        case 'mysql':
            method += `      const query = 'DELETE FROM ${serviceName.toLowerCase()}s WHERE id = $1 RETURNING *';\n`;
            method += `      const result = await db.query(query, [id]);\n`;
            method += `      return result.rows[0] || result[0];\n`;
            break;
        default:
            method += `      // Mock implementation\n`;
            method += `      return { id, deleted: true };\n`;
    }
    
    method += `    } catch (error) {\n`;
    method += `      throw new Error(\`Error deleting ${serviceName}: \${error.message}\`);\n`;
    method += `    }\n`;
    method += `  }\n`;
    
    return method;
}

/**
 * 파일 생성 헬퍼
 */
function createFeatureFiles(outputDir, featureData) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const files = [];
    
    if (Array.isArray(featureData)) {
        featureData.forEach(data => {
            const filePath = path.join(outputDir, data.filename);
            fs.writeFileSync(filePath, data.content);
            files.push(filePath);
        });
    } else {
        const filePath = path.join(outputDir, featureData.filename);
        fs.writeFileSync(filePath, featureData.content);
        files.push(filePath);
    }

    return files;
}

module.exports = {
    generateExpressEndpoint,
    generateDatabaseModel,
    generateService,
    createFeatureFiles
}; 