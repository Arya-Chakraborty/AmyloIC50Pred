"use client"
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const Contact = () => {
    const [isScrolled, setIsScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 10);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const navLinks = [
        { name: 'Predict', path: '/' },
        { name: 'Contact us', path: '/contact' }
    ];

    return (
        <div className="min-h-screen font-sans transition-colors duration-300 bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 overflow-x-hidden">
            {/* Navbar */}
            <nav className={`fixed w-full z-50 transition-all duration-300 ${isScrolled ? 'bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-sm' : 'bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm'}`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo and brand name - left side */}
                        <div className="flex-shrink-0 flex items-center">
                            <Link href="/" className="flex items-center space-x-2" onClick={() => setMobileMenuOpen(false)}>
                                <img
                                    src="logo.png"
                                    alt="PKM2Pred Logo"
                                    className="h-8 w-auto"
                                />
                                <span className="text-xl font-bold text-cyan-900 dark:text-cyan-400">
                                    PKM2Pred
                                </span>
                            </Link>
                        </div>

                        {/* Desktop navigation - right side */}
                        <div className="hidden md:block">
                            <div className="ml-10 flex items-center space-x-8">
                                {navLinks.map((link) => (
                                    <Link
                                        key={link.name}
                                        href={link.path}
                                        className={`text-gray-700 dark:text-gray-300 hover:text-cyan-600 dark:hover:text-cyan-400 px-3 py-2 rounded-md text-sm font-medium transition-colors ${link.path === '/contact' ? 'font-semibold text-cyan-600 dark:text-cyan-400' : ''}`}
                                    >
                                        {link.name}
                                    </Link>
                                ))}
                            </div>
                        </div>

                        {/* Mobile menu button */}
                        <div className="md:hidden flex items-center">
                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="inline-flex items-center justify-center p-2 rounded-md text-gray-700 dark:text-gray-300 hover:text-cyan-600 dark:hover:text-cyan-400 focus:outline-none"
                                aria-expanded="false"
                            >
                                <span className="sr-only">Open main menu</span>
                                {!mobileMenuOpen ? (
                                    <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                    </svg>
                                ) : (
                                    <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile menu */}
                <AnimatePresence>
                    {mobileMenuOpen && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="md:hidden overflow-hidden"
                        >
                            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white dark:bg-gray-800">
                                {navLinks.map((link) => (
                                    <Link
                                        key={link.name}
                                        href={link.path}
                                        className={`block px-3 py-2 rounded-md text-base font-medium ${link.path === '/contact' ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-700 dark:text-gray-300'} hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
                                        onClick={() => setMobileMenuOpen(false)}
                                    >
                                        {link.name}
                                    </Link>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </nav>

            {/* Main Content */}
            <div className="pt-24 pb-12 px-4 sm:px-6 lg:px-8"> {/* Adjusted padding to account for navbar */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="max-w-2xl mx-auto"
                >
                    <div className="bg-white dark:bg-gray-800/70 backdrop-blur-md shadow-xl rounded-xl p-8 border border-gray-200 dark:border-gray-700">
                        <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-800 dark:text-gray-100 mb-6">
                            Contact us
                        </h2>

                        <div className="space-y-6 text-center">
                            <p className="text-gray-600 dark:text-gray-300 text-lg">
                                For any enquiries please contact:
                            </p>

                            <div className="space-y-2">
                                <h3 className="text-xl font-semibold text-cyan-700 dark:text-cyan-400">
                                    Dr. Alok Jain
                                </h3>
                                <p className="text-gray-600 dark:text-gray-400 text-xs">
                                    Advanced BioComputing Lab, Birla Institute of Technology Mesra, Ranchi - 835215, Jharkhand, India
                                </p>
                                <a
                                    href="mailto:alokjain@bitmesra.ac.in"
                                    className="text-lg text-gray-700 dark:text-gray-200 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors inline-flex items-center gap-2 underline underline-offset-4 decoration-cyan-500/30 hover:decoration-cyan-500/50"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                                    </svg>
                                    alokjain@bitmesra.ac.in
                                </a>
                            </div>

                            <div className="pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    We'll respond to your inquiry as soon as possible.
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default Contact;