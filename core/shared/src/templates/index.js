/**
 * Templates Module - Unified Export
 * 개발 템플릿 통합 모듈
 */

const componentTemplate = require('./component-template');
const featureTemplate = require('./feature-template');

module.exports = {
    // Component Templates
    ...componentTemplate,
    
    // Feature Templates  
    ...featureTemplate,
    
    // Convenience methods
    templates: {
        component: componentTemplate,
        feature: featureTemplate
    }
}; 