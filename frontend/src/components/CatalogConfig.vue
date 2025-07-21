<template>
  <div>
    <draggable 
      v-model="localCatalogs" 
      @end="onDragEnd" 
      item-key="id" 
      handle=".drag-handle"
      ghost-class="sortable-ghost"
      chosen-class="sortable-chosen"
      class="space-y-3"
      :animation="150"
    >
      <template #item="{ element, index }">
        <div class="toggle-group-wrapper" 
             :class="{ 
               'item-moved': movedItemId === element.id
             }">
          <div class="toggle-group">
            <div class="drag-handle">
              <i class="fas fa-grip-vertical"></i>
            </div>
            <label :for="`${element.id}-toggle`" class="toggle-label">
              <i :class="element.icon"></i>
              {{ element.name }}
              <span class="tooltip">{{ element.tooltip }}</span>
            </label>
            <label class="toggle-switch">
              <input 
                type="checkbox" 
                :id="`${element.id}-toggle`"
                :checked="element.enabled"
                @change="onToggle(element.id, $event.target.checked)"
              >
              <span class="slider"></span>
            </label>
          </div>
          <div class="reorder-controls">
            <button 
              @click="moveItem(index, -1)" 
              :disabled="index === 0" 
              class="reorder-button" 
              title="Move Up"
            >
              <i class="fas fa-chevron-up"></i>
          </button>
            <button 
              @click="moveItem(index, 1)" 
              :disabled="index === localCatalogs.length - 1" 
              class="reorder-button" 
              title="Move Down"
            >
              <i class="fas fa-chevron-down"></i>
            </button>
          </div>
        </div>
      </template>
    </draggable>
  </div>
</template>

<script>
import { ref, watch } from 'vue';
import draggable from 'vuedraggable';

export default {
  name: 'CatalogConfig',
  components: {
    draggable
  },
  props: {
    type: String,
    catalogs: Array
  },
  emits: ['update-order', 'update-toggle'],
  setup(props, { emit }) {
    const localCatalogs = ref([...props.catalogs]);
    const movedItemId = ref(null);

    watch(() => props.catalogs, (newVal) => {
      localCatalogs.value = [...newVal];
    });

    const onDragEnd = () => {
      emit('update-order', props.type, localCatalogs.value);
    };

    const moveItem = (index, direction) => {
      const newIndex = index + direction;
      if (newIndex >= 0 && newIndex < localCatalogs.value.length) {
        const item = localCatalogs.value.splice(index, 1)[0];
        localCatalogs.value.splice(newIndex, 0, item);
        
        // Set the moved item ID for visual feedback
        movedItemId.value = item.id;
        
        // Clear the highlight after animation
        setTimeout(() => {
          movedItemId.value = null;
        }, 600);
        
        emit('update-order', props.type, localCatalogs.value);
      }
    };

    const onToggle = (catalogId, enabled) => {
      emit('update-toggle', props.type, catalogId, enabled);
    };

    return {
      localCatalogs,
      movedItemId,
      onDragEnd,
      moveItem,
      onToggle,
    };
  },
};
</script>

<style scoped>
.toggle-group-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.3s ease;
}
.toggle-group-wrapper.item-moved {
  animation: moveHighlight 0.6s ease-out;
}
@keyframes moveHighlight {
  0% {
    background: rgba(0, 168, 107, 0.1);
    border-radius: 12px;
    transform: scale(1.02);
    box-shadow: 0 0 20px rgba(0, 168, 107, 0.3);
  }
  50% {
    background: rgba(0, 168, 107, 0.15);
    border-radius: 12px;
    transform: scale(1.01);
    box-shadow: 0 0 15px rgba(0, 168, 107, 0.2);
  }
  100% {
    background: transparent;
    border-radius: 0;
    transform: scale(1);
    box-shadow: none;
  }
}
.toggle-group {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 15px;
  background: rgba(50, 61, 62, 0.4);
  border-radius: 10px;
  transition: all 0.3s ease;
  flex-grow: 1;
}
.toggle-group:hover {
  background: rgba(50, 61, 62, 0.6);
}
.drag-handle {
  color: #8EC7B4;
  cursor: grab;
  font-size: 1.2rem;
}
.drag-handle:active {
  cursor: grabbing;
}
.toggle-label {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #fff;
  font-weight: 500;
  flex-grow: 1;
  text-align: left;
  cursor: pointer;
  position: relative;
}
.toggle-label:hover .tooltip {
  visibility: visible;
  opacity: 1;
}
.tooltip {
  visibility: hidden;
  opacity: 0;
  background: #222D2E;
  color: #E0E0E0;
  font-size: 0.85rem;
  padding: 8px 12px;
  border-radius: 6px;
  position: absolute;
  top: -40px;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  z-index: 10;
  border: 1px solid rgba(0, 168, 107, 0.3);
  transition: opacity 0.2s ease, visibility 0.2s ease;
}
.tooltip::before {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid #222D2E;
}
.toggle-label i {
  color: #00A86B;
  width: 20px;
  text-align: center;
}
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 24px;
}
.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #555;
  transition: .4s;
  border-radius: 24px;
}
.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .4s;
  border-radius: 50%;
}
input:checked + .slider {
  background-color: #00A86B;
}
input:checked + .slider:before {
  transform: translateX(26px);
}
.reorder-controls {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.reorder-controls .reorder-button {
  width: 24px;
  height: 20px;
  background: rgba(0, 168, 107, 0.2) !important;
  border: none !important;
  border-radius: 4px;
  color: #00A86B;
  cursor: pointer;
  transition: none !important;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  outline: none !important;
  box-shadow: none !important;
}
.reorder-controls .reorder-button:hover:not(:disabled) {
  background: rgba(0, 168, 107, 0.4) !important;
}
.reorder-controls .reorder-button:active,
.reorder-controls .reorder-button:focus,
.reorder-controls .reorder-button:focus-visible,
.reorder-controls .reorder-button:focus-within,
.reorder-controls .reorder-button:visited,
.reorder-controls .reorder-button:link {
  background: rgba(0, 168, 107, 0.2) !important;
  outline: none !important;
  box-shadow: none !important;
  transform: none !important;
  text-decoration: none !important;
}
.reorder-controls .reorder-button:disabled {
  opacity: 0.5;
  pointer-events: none;
}
.sortable-ghost {
  opacity: 0.4;
  background: rgba(0, 168, 107, 0.2);
  border-radius: 10px;
}
.sortable-chosen {
  box-shadow: 0 0 15px rgba(0, 168, 107, 0.4);
  cursor: grabbing;
}
</style>
