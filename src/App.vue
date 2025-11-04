<template>
  <div id="app">
    <MainInterface/>
  </div>
</template>

<script>
import MainInterface from './components/MainInterface.vue';

export default {
  name: 'App',
  components: {
    MainInterface
  }
};
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  min-height: 100vh;
  background: #f5f5f5;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
</style>
