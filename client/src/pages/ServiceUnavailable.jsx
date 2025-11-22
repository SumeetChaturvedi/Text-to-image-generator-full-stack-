import React from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from "motion/react"
import { assets } from '../assets/assets'

const ServiceUnavailable = () => {
  const navigate = useNavigate()

  return (
    <motion.div
      initial={{opacity: 0, y: 50}}
      animate={{opacity: 1, y: 0}}
      transition={{duration: 0.5}}
      className='min-h-[80vh] flex flex-col items-center justify-center text-center px-4'
    >
      <div className='max-w-md'>
        <img 
          src={assets.logo} 
          alt="logo" 
          className='w-32 sm:w-40 mx-auto mb-8' 
        />
        <h1 className='text-6xl sm:text-7xl font-bold text-gray-300 mb-4'>404</h1>
        <h2 className='text-2xl sm:text-3xl font-semibold text-gray-800 mb-4'>
          Service Currently Unavailable
        </h2>
        <p className='text-gray-600 mb-8 text-lg'>
          This service is currently unavailable. Please visit back soon.
        </p>
        <button
          onClick={() => navigate('/')}
          className='bg-gray-800 text-white px-8 py-3 rounded-full hover:bg-gray-700 transition-colors duration-200'
        >
          Go Back Home
        </button>
      </div>
    </motion.div>
  )
}

export default ServiceUnavailable

