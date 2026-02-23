import mongoose from "mongoose";

const sharedWorkSchema = mongoose.Schema(
{
id_work:{
type:mongoose.Schema.Types.ObjectId,
ref:"Work",
required:true
},

password_hash:String,

sha256_string:{
type:String,
required:true
},

end_date:Date

},{timestamps:true});

export default mongoose.model("SharedWork",sharedWorkSchema);