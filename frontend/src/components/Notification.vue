<template>
  <div class="notification" :class="{ 'show': show }">
    <i class="fas fa-check-circle"></i>
    <span>{{ text }}</span>
  </div>
</template>

<script>
export default {
  name: 'Notification',
  props: {
    show: {
      type: Boolean,
      required: true
    },
    text: {
      type: String,
      required: true
    }
  }
}
</script>
