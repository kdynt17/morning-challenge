import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {initializeAuth,indexedDBLocalPersistence,browserLocalPersistence,browserSessionPersistence,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getDatabase,ref,onValue} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';
import {firebaseConfig} from '../firebase-config.js';
import {mountBrain} from './brain.js';
const app=initializeApp(firebaseConfig),db=getDatabase(app);
const auth=initializeAuth(app,{persistence:[indexedDBLocalPersistence,browserLocalPersistence,browserSessionPersistence]});
const root=document.querySelector('#brain-root'),message=document.querySelector('#account-message');
let dispose,unsubscribe,activeUid;
onAuthStateChanged(auth,user=>{
  dispose?.();dispose=null;unsubscribe?.();activeUid=null;
  if(!user){message.hidden=false;message.textContent='아침 챌린지 홈에서 로그인한 뒤 다시 들어와 주세요.';return;}
  unsubscribe=onValue(ref(db,`users/${user.uid}`),snapshot=>{
    const p=snapshot.val();
    if(!p||p.role!=='student'||(p.status&&p.status!=='approved')){
      dispose?.();dispose=null;activeUid=null;message.hidden=false;
      message.textContent=p?.role==='teacher'?'학생 계정으로 게임에 참여해주세요.':'선생님이 가입을 승인하면 이용할 수 있어요.';return;
    }
    message.hidden=true;
    if(activeUid!==user.uid){activeUid=user.uid;dispose=mountBrain({app,db,user,root});}
  },()=>{message.hidden=false;message.textContent='계정 정보를 불러오지 못했습니다. 홈으로 돌아가 다시 로그인해주세요.';});
});
