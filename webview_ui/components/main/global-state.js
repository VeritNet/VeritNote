// components/main/global-state.js

// 1. 定义全局状态对象
window.globalState = {
    references: [] // 这是第一个全局变量：共享的引用区数据
};

// 2. 创建一个自定义事件，用于通知状态变更
const referencesChangedEvent = new CustomEvent('global:referencesChanged');

// 3. 提供公共接口函数来修改全局状态

/**
 * 添加一个引用到全局列表
 * @param {string} filePath - 引用所在的文件路径
 * @param {object} blockData - 被引用的块的数据
 */
window.addGlobalReference = function(filePath, blockData) {
    // 检查是否已存在
    if (globalState.references.some(ref => ref.blockData.id === blockData.id)) {
        return;
    }
    globalState.references.push({ filePath, blockData });
    window.dispatchEvent(referencesChangedEvent);
};

/**
 * 从全局列表移除一个引用
 * @param {string} blockId - 要移除的块的ID
 */
window.removeGlobalReference = function(blockId) {
    const initialLength = globalState.references.length;
    globalState.references = globalState.references.filter(ref => ref.blockData.id !== blockId);
    if (globalState.references.length < initialLength) {
        window.dispatchEvent(referencesChangedEvent);
    }
};

/**
 * 完全替换全局引用列表（用于重新排序）
 * @param {Array} newReferencesArray - 新的引用对象数组
 */
window.updateGlobalReferences = function(newReferencesArray) {
    globalState.references = newReferencesArray;
    window.dispatchEvent(referencesChangedEvent);
};

/**
 * 更新全局状态中的单个引用项的 blockData
 * @param {object} updatedBlockData 
 */
window.updateGlobalReferenceData = function(updatedBlockData) {
    if (!updatedBlockData || !updatedBlockData.id) {
        return;
    }

    const ref = globalState.references.find(r => 
        r && r.blockData && r.blockData.id === updatedBlockData.id
    );

    if (ref) {
        if (JSON.stringify(ref.blockData) !== JSON.stringify(updatedBlockData)) {
            ref.blockData = updatedBlockData;
            window.dispatchEvent(new CustomEvent('global:referencesChanged'));
        }
    }
}