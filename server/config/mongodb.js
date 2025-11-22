import mongoose from "mongoose";

const connectDB = async()=>{
    mongoose.connection.on('connected',()=>{
        console.log("Databsase Connected")
    })
    await mongoose.connect(`${process.env.MONGODB_URI}/fullstackproject`)
}

export default connectDB;