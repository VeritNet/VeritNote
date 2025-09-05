// js/blocks/ContainerBlock.js
class ContainerBlock extends Block {
    constructor(data, editor) {
        super(data, editor);
        this.isContainer = true;
    }
    
    // *** FIX: Restore the standard wrapper from the base Block class. ***
    // This ensures all containers are consistently wrapped and draggable.
    // The previous implementation was incorrect.
    _createWrapperElement() {
        return super._createWrapperElement(); // Just call the parent method.
    }
}